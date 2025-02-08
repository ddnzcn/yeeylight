import * as dgram from "node:dgram";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DeviceInfo } from "../types";

export class Discovery {
  private static readonly SSDP_PORT = 1982;
  private static readonly SSDP_ADDR = "239.255.255.250";
  private static readonly CACHE_FILE = path.join(
    process.cwd(),
    ".yeelight-cache.json",
  );
  private static readonly DISCOVERY_MSG = Buffer.from(
    "M-SEARCH * HTTP/1.1\r\n" +
      "HOST: 239.255.255.250:1982\r\n" +
      'MAN: "ssdp:discover"\r\n' +
      "ST: wifi_bulb\r\n" +
      "\r\n",
  );

  private static loadCache(): DeviceInfo[] {
    try {
      if (fs.existsSync(this.CACHE_FILE)) {
        const data = fs.readFileSync(this.CACHE_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn("Failed to load device cache:", error);
    }
    return [];
  }

  private static saveCache(devices: DeviceInfo[]) {
    try {
      fs.writeFileSync(this.CACHE_FILE, JSON.stringify(devices, null, 2));
    } catch (error) {
      console.warn("Failed to save device cache:", error);
    }
  }

  static getKnownDevices(): DeviceInfo[] {
    return this.loadCache();
  }

  static async discover(
    timeout: number = 3000,
    useCache: boolean = true,
  ): Promise<DeviceInfo[]> {
    const devices = new Map<string, DeviceInfo>();
    const sockets: dgram.Socket[] = [];

    // Load cached devices first if useCache is true
    if (useCache) {
      const cachedDevices = this.loadCache();
      cachedDevices.forEach((device) => devices.set(device.ip, device));
    }

    try {
      // Create a socket for each network interface
      const networkInterfaces = Object.values(os.networkInterfaces()).flat();

      for (const networkInterface of networkInterfaces) {
        if (
          !networkInterface ||
          networkInterface.internal ||
          networkInterface.family !== "IPv4"
        ) {
          continue;
        }

        const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
        sockets.push(socket);

        socket.on("message", (msg, _rinfo) => {
          const response = msg.toString();
          if (response.includes("yeelight")) {
            this.parseResponse(response, devices);
          }
        });

        socket.on("error", (err) => {
          console.error(
            `Socket error on interface ${networkInterface.address}:`,
            err,
          );
        });

        try {
          await new Promise<void>((resolve) => {
            socket.bind(
              {
                // instead of binding to networkInterface.address
                // note(ddnzcn): this is a test for my ubuntu box
                // which cannot see my bulb for some reason.
                address: "0.0.0.0",
                port: 0,
              },
              () => {
                socket.setBroadcast(true);
                try {
                  socket.addMembership(this.SSDP_ADDR);
                  socket.send(
                    this.DISCOVERY_MSG,
                    0,
                    this.DISCOVERY_MSG.length,
                    this.SSDP_PORT,
                    this.SSDP_ADDR,
                  );
                } catch (err) {
                  console.error(
                    `Failed to setup multicast on ${networkInterface.address}:`,
                    err,
                  );
                }
                resolve();
              },
            );
          });
        } catch (err) {
          console.error(`Failed to bind to ${networkInterface.address}:`, err);
        }
      }

      // Wait for responses
      await new Promise((resolve) => setTimeout(resolve, timeout));

      return Array.from(devices.values());
    } finally {
      // Ensure sockets are closed even if an error occurs
      sockets.forEach((socket) => {
        try {
          socket.close();
        } catch (err) {
          console.error("Error closing socket:", err);
        }
      });
    }
  }

  static async addDeviceManually(deviceInfo: DeviceInfo): Promise<void> {
    const devices = this.loadCache();
    const existingIndex = devices.findIndex((d) => d.ip === deviceInfo.ip);

    if (existingIndex >= 0) {
      devices[existingIndex] = deviceInfo;
    } else {
      devices.push(deviceInfo);
    }

    this.saveCache(devices);
  }

  static async removeDevice(ip: string): Promise<void> {
    const devices = this.loadCache();
    const filteredDevices = devices.filter((d) => d.ip !== ip);
    this.saveCache(filteredDevices);
  }

  private static parseResponse(
    response: string,
    devices: Map<string, DeviceInfo>,
  ) {
    const location = response.match(/Location: ([^\r\n]+)/i);
    if (!location) return;

    const [ip, port] = location[1].replace("yeelight://", "").split(":");

    if (!devices.has(ip)) {
      const device: DeviceInfo = {
        ip,
        port: parseInt(port),
        id: this.extractValue(response, "id"),
        model: this.extractValue(response, "model"),
        name: this.extractValue(response, "name"),
        firmware: this.extractValue(response, "fw_ver"),
        support: this.extractValue(response, "support")?.split(" "),
        power: this.extractValue(response, "power") as "on" | "off",
      };

      devices.set(ip, device);
    }
  }

  private static extractValue(
    response: string,
    key: string,
  ): string | undefined {
    const match = response.match(new RegExp(`${key}: ([^\r\n]+)`, "i"));
    return match?.[1];
  }
}
