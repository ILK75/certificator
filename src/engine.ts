import config from './serverConfig';
import { ensureEnv } from './setup';
import { IConfig, FumeServer } from 'fume-fhir-converter';
import { extraBindings } from './helpers';
import { setFumeServer } from './config';
import { loadMapFiles } from './helpers/loadMaps';
import { version as CERTIFICATOR_VERSION } from '../package.json';
import type { Request, Response, NextFunction } from 'express';
import chalk from 'chalk';

let configObject: IConfig;
const port: number = 8401;

// middleware function for handling healthcheck api routes
const reRouter = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method.toLowerCase() === 'get' && (req.originalUrl === '/' || req.originalUrl === '/health')) {
    res.status(200).json({
      CERTIFICATOR_VERSION,
      FHIR_SERVER_BASE: configObject.FHIR_SERVER_BASE,
      CERTIFICATOR_API_PORT: configObject.SERVER_PORT
    });
  } else {
    next();
  }
};

// alternative logger object
const logger = {
  info: () => { /* Do nothing with info level logging from FUME */ },
  warn: (input: any | any[]) => console.warn(input),
  error: (input: any | any[]) => console.error(input)
};

// start the server
async function init () {
  try {
    // parse env file and set config object
    const newConfig: IConfig = await ensureEnv(config);
    newConfig.SERVER_PORT = port;
    configObject = newConfig;
    // create a fume server
    const fumeServer = new FumeServer<IConfig>();
    // register alternative logger and middleware
    fumeServer.registerLogger(logger);
    console.log(chalk.grey('Registered logger'));
    fumeServer.registerAppMiddleware(reRouter);
    console.log(chalk.grey('Registered HTTP server middleware'));
    // register custom function binding
    for (const key in extraBindings) {
      fumeServer.registerBinding(key, extraBindings[key]);
      console.log(chalk`Registered {green $${key}()} function binding`);
    };
    // register FHIR server URL parameter
    fumeServer.registerBinding('fhirServer', newConfig.FHIR_SERVER_BASE);
    // set as the global server object
    setFumeServer(fumeServer);
    // start warmup
    await fumeServer.warmUp(newConfig);
    // load and register maps
    loadMapFiles();
    console.log(chalk.grey(`\u{2714}  Engine ready and listening on port ${port}`));
    process.send('ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : err;
    console.error(chalk.red('Error in engine warmup: ', message));
    process.abort();
  }
}

export const serverPromise = init();
