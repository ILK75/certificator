/**
 * This is the main entry point for the Certificator backend engine.
 * This is meant to run as a forked process, separate from the main app.
 * It sets up the FUME server, loads the maps, and manages the validator process.
 * Inside the Node SEA exe, this is the script that will run if the first argument ends with 'engine.js'
 */

import config from './serverConfig';
import { ensureEnv } from './setup';
import { IConfig, FumeServer } from 'fume-fhir-converter';
import { extraBindings } from './helpers';
import { setFumeServer } from './helpers/configFumeServer';
import { loadMapFiles } from './helpers/loadMaps';
import { version as CERTIFICATOR_VERSION } from '../package.json';
import { sampleSize } from './helpers/getSampleSize';
import type { Request, Response, NextFunction } from 'express';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

// Load .env file contents into process.env
dotenv.config();
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
  error: (input: any | any[]) => {
    if (!(input?.code && input.code === 'ERR_BAD_REQUEST' && input?.config && input.config?.url && input.config.url === 'https://packages.fhir.org//')) {
      console.error(input);
    }
  }
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
    const fhirServer: string = newConfig.FHIR_SERVER_BASE;
    fumeServer.registerBinding('fhirServer', fhirServer);
    console.log(chalk`Registered {yellow $fhirServer} parameter binding. Value: {blue ${fhirServer}}`);
    fumeServer.registerBinding('sampleSize', sampleSize);
    console.log(chalk`Registered {yellow $sampleSize} parameter binding. Value: {blue ${sampleSize}}`);
    // set as the global server object
    setFumeServer(fumeServer);
    console.log(chalk.grey('Registered FUME server'));
    // start warmup
    console.log(chalk.grey('\u{23F3} FUME server warming up...'));
    await fumeServer.warmUp(newConfig);
    console.log(chalk.grey('FUME server warmed up'));
    // load and register maps
    console.log(chalk.grey('Loading maps...'));
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
