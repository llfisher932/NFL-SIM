import { cliErrorMessage } from "./args";
import { buildDashboard, publishDashboard } from "./publish";

buildDashboard()
  .then(() => publishDashboard((line) => console.log(line)))
  .catch((err: unknown) => {
    console.error(cliErrorMessage(err));
    process.exitCode = 1;
  });
