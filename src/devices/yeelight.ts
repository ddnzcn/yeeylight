import { EventEmitter } from "events";
import * as net from "net";
import {
  DeviceInfo,
  YeelightOptions,
  CommandOptions,
  YeelightResponse,
  YeelightError,
  PowerMode,
} from "../types";

export declare interface Yeelight {
  on(event: "connected", listener: () => void): this;
  on(event: "disconnected", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "notification", listener: (notification: any) => void): this;
}

export class Yeelight extends EventEmitter {
  private socket: net.Socket | null = null;
  private messageId: number = 0;
  private connected: boolean = false;
  private commandQueue: Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
      command: CommandOptions;
    }
  > = new Map();
  private buffer: string = "";
  private readonly options: Required<YeelightOptions>;

  constructor(
    private readonly deviceInfo: DeviceInfo,
    options: YeelightOptions = {},
  ) {
    super();
    this.options = {
      port: options.port ?? deviceInfo.port ?? 55443,
      timeout: options.timeout ?? 30000,
      logger: options.logger ?? {
        debug: () => {},
        error: console.error,
      },
    };
  }

  public async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      const timeout = setTimeout(() => {
        this.socket?.destroy();
        reject(new YeelightError("Connection timeout"));
      }, this.options.timeout);

      this.socket.on("connect", () => {
        clearTimeout(timeout);
        this.connected = true;
        this.emit("connected");
        resolve();
      });

      this.socket.on("data", (data) => this.handleData(data));
      this.socket.on("error", (error) => this.handleError(error));
      this.socket.on("close", () => this.handleClose());

      this.socket.connect(this.options.port, this.deviceInfo.ip);
    });
  }

  public async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  // Power control
  public async setPower(
    power: "on" | "off",
    mode: PowerMode = PowerMode.Normal,
    duration: number = 500,
  ): Promise<void> {
    await this.sendCommand("set_power", [power, mode, duration]);
  }

  public async turnOn(duration: number = 500): Promise<void> {
    await this.setPower("on", PowerMode.Normal, duration);
  }

  public async turnOff(duration: number = 500): Promise<void> {
    await this.setPower("off", PowerMode.Normal, duration);
  }

  // Brightness control
  public async setBrightness(
    brightness: number,
    duration: number = 500,
  ): Promise<void> {
    if (brightness < 1 || brightness > 100) {
      throw new YeelightError("Brightness must be between 1 and 100");
    }
    await this.sendCommand("set_bright", [brightness, "smooth", duration]);
  }

  // Color control
  public async setRGB(
    red: number,
    green: number,
    blue: number,
    duration: number = 500,
  ): Promise<void> {
    const rgb = (red << 16) | (green << 8) | blue;
    await this.sendCommand("set_rgb", [rgb, "smooth", duration]);
  }

  public async setColorTemperature(
    temperature: number,
    duration: number = 500,
  ): Promise<void> {
    if (temperature < 1700 || temperature > 6500) {
      throw new YeelightError(
        "Color temperature must be between 1700 and 6500K",
      );
    }
    await this.sendCommand("set_ct_abx", [temperature, "smooth", duration]);
  }

  public async setHSV(
    hue: number,
    saturation: number,
    duration: number = 500,
  ): Promise<void> {
    if (hue < 0 || hue > 359) {
      throw new YeelightError("Hue must be between 0 and 359");
    }
    if (saturation < 0 || saturation > 100) {
      throw new YeelightError("Saturation must be between 0 and 100");
    }

    await this.sendCommand("set_hsv", [hue, saturation, "smooth", duration]);
  }

  private async sendCommand(
    method: string,
    params: any[] = [],
  ): Promise<YeelightResponse> {
    if (!this.connected || !this.socket) {
      throw new YeelightError("Not connected to device");
    }

    const id = ++this.messageId;
    const command: CommandOptions = { id, method, params };
    const commandString = JSON.stringify(command) + "\r\n";

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.commandQueue.delete(id);
        reject(new YeelightError("Command timeout", undefined, command));
      }, this.options.timeout);

      this.commandQueue.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        },
        command,
      });

      this.socket!.write(commandString, (error) => {
        if (error) {
          this.commandQueue.delete(id);
          clearTimeout(timeout);
          reject(
            new YeelightError(
              `Failed to send command: ${error.message}`,
              undefined,
              command,
            ),
          );
        }
      });
    });
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);

      try {
        const response = JSON.parse(line);
        if ("method" in response) {
          // Handle notifications
          this.emit("notification", response);
        } else if ("id" in response) {
          // Handle command responses
          const command = this.commandQueue.get(response.id);
          if (command) {
            this.commandQueue.delete(response.id);
            if ("error" in response) {
              command.reject(
                new YeelightError(
                  response.error.message,
                  response.error.code,
                  command.command,
                ),
              );
            } else {
              command.resolve(response);
            }
          }
        }
      } catch (error) {
        this.options.logger.error(`Failed to parse response: ${error}`);
      }
    }
  }

  private handleError(error: Error): void {
    this.emit("error", error);
    this.connected = false;
  }

  private handleClose(): void {
    this.connected = false;
    this.emit("disconnected");

    // Reject all pending commands
    this.commandQueue.forEach(({ reject }, id) => {
      reject(new YeelightError("Connection closed"));
    });
    this.commandQueue.clear();
  }
}
