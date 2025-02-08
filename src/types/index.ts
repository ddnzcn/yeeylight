export interface DeviceInfo {
  ip: string;
  port: number;
  id?: string;
  model?: string;
  name?: string;
  firmware?: string;
  support?: string[];
  power?: "on" | "off";
}

export interface CommandResult {
  id: number;
  result: string[];
}

export interface ErrorResult {
  id: number;
  error: {
    code: number;
    message: string;
  };
}

export type YeelightResponse = CommandResult | ErrorResult;

export interface CommandOptions {
  method: string;
  params: any[];
  id?: number;
}

export enum PowerMode {
  Normal = 0,
  ColorTemperature = 1,
  RGB = 2,
  HSV = 3,
  ColorFlow = 4,
  NightLight = 5,
}

export interface YeelightOptions {
  port?: number;
  timeout?: number;
  logger?: {
    debug: (message: string) => void;
    error: (message: string) => void;
  };
}

export class YeelightError extends Error {
  constructor(
    message: string,
    public code?: number,
    public command?: CommandOptions,
  ) {
    super(message);
    this.name = "YeelightError";
  }
}
