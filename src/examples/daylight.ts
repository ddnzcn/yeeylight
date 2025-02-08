import { Discovery, Yeelight } from "../";
import { YeelightError } from "../types";

const WAKE_UP_TIME = "07:30";
const SUNRISE_DURATION_MINUTES = 15; // Duration of the sunrise effect
const INITIAL_BRIGHTNESS = 1;
const FINAL_BRIGHTNESS = 100;
const INITIAL_COLOR_TEMP = 2700; // Warm light
const FINAL_COLOR_TEMP = 5000; // Natural daylight

const log = {
  info: (message: string) => console.log(`ℹ️ ${message}`),
  success: (message: string) => console.log(`✅ ${message}`),
  error: (message: string) => console.error(`❌ ${message}`),
  warning: (message: string) => console.log(`⚠️ ${message}`),
};

async function simulateSunrise(light: Yeelight): Promise<void> {
  try {
    // Turn on with minimum brightness
    await light.turnOn();
    await light.setBrightness(INITIAL_BRIGHTNESS);
    await light.setColorTemperature(INITIAL_COLOR_TEMP);

    const steps = 20; // Number of steps for the transition
    const stepDelay = (SUNRISE_DURATION_MINUTES * 60 * 1000) / steps;

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;

      // Calculate current values
      const brightness = Math.round(
        INITIAL_BRIGHTNESS + (FINAL_BRIGHTNESS - INITIAL_BRIGHTNESS) * progress,
      );
      const colorTemp = Math.round(
        INITIAL_COLOR_TEMP + (FINAL_COLOR_TEMP - INITIAL_COLOR_TEMP) * progress,
      );

      log.info(
        `Step ${i + 1}/${steps + 1}: Brightness ${brightness}%, Color Temperature ${colorTemp}K`,
      );

      await light.setBrightness(brightness);
      await light.setColorTemperature(colorTemp);

      await new Promise((resolve) => setTimeout(resolve, stepDelay));
    }

    log.success("Sunrise simulation completed");
  } catch (error) {
    log.error(`Error during sunrise: ${error}`);
    throw error;
  }
}

async function connectToLight(): Promise<Yeelight> {
  const devices = await Discovery.discover();

  if (devices.length === 0) {
    throw new Error("No devices found");
  }

  const light = new Yeelight(devices[0], {
    logger: {
      debug: (msg) => log.info(`Debug: ${msg}`),
      error: (msg) => log.error(`Error: ${msg}`),
    },
  });

  await light.connect();
  return light;
}

function getMillisecondsUntilTime(targetTime: string): number {
  const [hours, minutes] = targetTime.split(":").map(Number);
  const now = new Date();
  const target = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes,
  );

  if (target.getTime() < now.getTime()) {
    // If target time is in the past, schedule for next day
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

async function main() {
  try {
    const msUntilWakeUp = getMillisecondsUntilTime(WAKE_UP_TIME);
    const minutesUntilWakeUp = Math.round(msUntilWakeUp / 1000 / 60);

    log.info(`Scheduled sunrise for ${WAKE_UP_TIME}`);
    log.info(`Starting in ${minutesUntilWakeUp} minutes`);

    // Wait until start time
    await new Promise((resolve) =>
      setTimeout(resolve, msUntilWakeUp - SUNRISE_DURATION_MINUTES * 60 * 1000),
    );

    log.info("Connecting to light...");
    const light = await connectToLight();

    log.info("Starting sunrise simulation...");
    await simulateSunrise(light);

    await light.disconnect();
  } catch (error) {
    log.error("Error in main process:");
    console.error(error);
  }
}

// Run indefinitely
async function runDaily() {
  while (true) {
    await main();
    // Wait a bit before starting the next day's cycle
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
}

runDaily().catch((error) => {
  log.error("Fatal error:");
  console.error(error);
  process.exit(1);
});
