import { parseRequest } from "./lib/query.ts";
import { PromptCancelled, Terminal } from "./lib/terminal.ts";
const [raw = "", configuration = "{}"] = Deno.args;
const status = JSON.parse(configuration).status;
let request = parseRequest(raw);
if (status === "cancelled" || status === "needs_setup") request.status = status;
else if (!raw) {
  const terminal = Terminal.open();
  if (terminal) {
    try {
      terminal.write(
        "\nTry: whatever is today · that galaxy ai project · Faff last month\n",
      );
      while (true) {
        const answer = await terminal.ask(
          "What do you want to open? (Enter: upcoming events)",
        );
        try {
          request = parseRequest(answer);
          terminal.write(
            `Searching ${request.label.toLowerCase()}${
              request.search_text ? ` for ${request.search_text}` : ""
            }.\n`,
          );
          break;
        } catch (error) {
          terminal.write(`${(error as Error).message}\n`);
        }
      }
    } catch (error) {
      if (!(error instanceof PromptCancelled)) throw error;
      request.status = "cancelled";
    } finally {
      terminal.close();
    }
  }
}
console.log(JSON.stringify(request));
