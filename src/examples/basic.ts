import { Discovery, Yeelight } from "../";

async function main() {
  try {
    const devices = await Discovery.discover();
    console.log("Found devices:", devices);

    if (devices.length === 0) {
      console.error("No devices found");
      return;
    }

    const light = new Yeelight(devices[0], {
      logger: {
        debug: console.log,
        error: console.error,
      },
    });

    light.on("connected", () => console.log("Connected to device"));
    light.on("disconnected", () => console.log("Disconnected from device"));
    light.on("error", (error) => console.error("Device error:", error));
    light.on("notification", (notification) =>
      console.log("Notification:", notification),
    );

    await light.connect();
    // Example control sequence
    await light.turnOff();

    // await new Promise((resolve) => setTimeout(resolve, 1000));

    // await light.setBrightness(50);
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    // await light.setRGB(255, 0, 0); // Red
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    // await light.turnOff();

    // await light.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
