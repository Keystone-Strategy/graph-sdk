import { createCommand } from 'commander';

import { collect, visualize, sync, run, document, types, visualizeTypes } from './commands';

export function createCli() {
  return createCommand()
    .addCommand(collect())
    .addCommand(visualize())
    .addCommand(sync())
    .addCommand(run())
    .addCommand(types())
    .addCommand(visualizeTypes())
    .addCommand(document());
}
