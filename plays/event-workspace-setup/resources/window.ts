const [hoursRaw = "24"] = Deno.args;
const hours = Number(hoursRaw);
if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
  throw new Error("horizon_hours must be an integer from 1 to 168");
}
const now = new Date();
console.log(
  JSON.stringify({
    time_min: now.toISOString(),
    time_max: new Date(now.getTime() + hours * 3600_000).toISOString(),
  }),
);
