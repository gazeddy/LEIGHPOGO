export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startEventInfographicAutomation } = await import(
    "./lib/event-infographic-automation"
  );
  startEventInfographicAutomation();
}
