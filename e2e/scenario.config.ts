export const scenarioEnvironment = {
  origin: process.env['SCENARIO_A_ORIGIN'],
  child: {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    CI: process.env['CI'],
    TMPDIR: process.env['TMPDIR'],
  },
};
