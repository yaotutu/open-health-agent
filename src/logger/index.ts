import chalk from 'chalk';

const formatTime = () => new Date().toISOString().slice(11, 23);

export const logger = {
  info: (module: string, msg: string, data?: unknown) => {
    console.log(
      chalk.gray(`[${formatTime()}]`) +
      chalk.cyan(`[${module}]`) +
      ` ${msg}`
    );
    if (data !== undefined) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  },

  error: (module: string, msg: string, err?: Error) => {
    console.error(
      chalk.gray(`[${formatTime()}]`) +
      chalk.red(`[${module}]`) +
      ` ${msg}`
    );
    if (err) {
      console.error(chalk.red(err.stack || err.message));
    }
  },

  debug: (module: string, msg: string, data?: unknown) => {
    if (process.env.DEBUG) {
      console.log(
        chalk.gray(`[${formatTime()}]`) +
        chalk.magenta(`[${module}]`) +
        ` ${msg}`
      );
      if (data !== undefined) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }
};
