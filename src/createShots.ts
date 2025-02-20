import type { Server } from 'node:http';
import { mapLimit } from 'async';
import type { BrowserType } from 'playwright-core';
import {
  collectLadleStories,
  generateLadleShotItems,
} from './crawler/ladleScreenshots';
import {
  type PageScreenshotParameter,
  config,
  isPlatformModeConfig,
} from './config';
import {
  collectStories,
  generateStorybookShotItems,
} from './crawler/storybook';
import {
  generatePageShotItems,
  getPagesFromExternalLoader,
} from './crawler/pageScreenshots';
import { log } from './log';
import { takeScreenShots } from './shots/shots';
import {
  getBrowsers,
  readDirIntoShotItems,
  removeFilesInFolder,
} from './utils';
import { launchStaticWebServer } from './crawler/utils';
import type { ShotItem } from './types';
import {
  collectHistoireStories,
  generateHistoireShotItems,
} from './crawler/histoireScreenshots';

export const createShots = async () => {
  const {
    ladleShots,
    histoireShots,
    storybookShots,
    pageShots,
    customShots,
    imagePathCurrent,
  } = config;
  let storybookShotItems: ShotItem[] = [];
  let ladleShotItems: ShotItem[] = [];
  let histoireShotItems: ShotItem[] = [];
  let pageShotItems: ShotItem[] = [];
  let customShotItems: ShotItem[] = [];

  removeFilesInFolder(imagePathCurrent);

  if (!isPlatformModeConfig(config)) {
    removeFilesInFolder(config.imagePathDifference);
  }

  const browsers = getBrowsers();

  if (ladleShots) {
    const { ladleUrl, mask } = ladleShots;

    log.process('info', 'general', `\n=== [Ladle Mode] ${ladleUrl} ===\n`);

    let ladleWebUrl = ladleUrl;
    let localServer: undefined | Server;

    if (!ladleUrl.startsWith('http://') && !ladleUrl.startsWith('https://')) {
      const staticWebServer = await launchStaticWebServer(ladleUrl);

      ladleWebUrl = staticWebServer.url;
      localServer = staticWebServer.server;
    }

    try {
      const collection = await collectLadleStories(ladleWebUrl);

      if (!collection || collection.length === 0) {
        throw new Error('Error: Stories not found');
      }

      log.process(
        'info',
        'general',
        `Found ${collection.length} ladle stories`,
      );

      await mapLimit(browsers, 1, async (browser: BrowserType) => {
        const shotItems = generateLadleShotItems(
          ladleWebUrl,
          Boolean(localServer),
          collection,
          mask,
          ladleShots.breakpoints,
          browsers.length > 1 ? browser : undefined,
        );

        const filterItemsToCheck =
          'filterItemsToCheck' in config
            ? config.filterItemsToCheck
            : undefined;

        const filteredShotItems = filterItemsToCheck
          ? shotItems.filter((item) => filterItemsToCheck(item))
          : shotItems;

        ladleShotItems = shotItems;

        log.process(
          'info',
          'general',
          `Prepared ${
            filteredShotItems.length
          } ladle stories for screenshots on ${browser.name()}`,
        );

        await takeScreenShots(filteredShotItems, browser);
      });

      localServer?.close();
    } catch (error: unknown) {
      localServer?.close();
      throw error;
    }

    log.process('info', 'general', 'Screenshots done!');
  }

  if (histoireShots) {
    const { histoireUrl, breakpoints } = histoireShots;
    let localServer;
    let histoireWebUrl: undefined | string;

    if (
      !histoireUrl.startsWith('http://') &&
      !histoireUrl.startsWith('https://')
    ) {
      const staticWebServer = await launchStaticWebServer(histoireUrl);

      histoireWebUrl = staticWebServer.url;
      localServer = staticWebServer.server;
    }

    if (!histoireWebUrl) {
      throw new Error('Error: Histoire web url not found');
    }

    log.process(
      'info',
      'general',
      `\n=== [Histoire Mode] ${histoireUrl} ===\n`,
    );

    try {
      const collection = await collectHistoireStories(histoireWebUrl);

      if (!collection || collection.length === 0) {
        throw new Error('Error: Stories not found');
      }

      log.process(
        'info',
        'general',
        `Found ${collection.length} Histoire stories`,
      );

      await mapLimit(browsers, 1, async (browser: BrowserType) => {
        const shotItems = generateHistoireShotItems(
          histoireWebUrl,
          collection,
          breakpoints,
          browsers.length > 1 ? browser : undefined,
        );

        histoireShotItems = shotItems;

        log.process(
          'info',
          'general',
          `Prepared ${
            shotItems.length
          } Histoire stories for screenshots on ${browser.name()}`,
        );

        await takeScreenShots(shotItems, browser);
      });

      localServer?.close();
    } catch (error: unknown) {
      localServer?.close();

      throw error;
    }

    log.process('info', 'general', 'Screenshots done!');
  }

  if (storybookShots) {
    const { storybookUrl, mask } = storybookShots;

    log.process(
      'info',
      'general',
      `\n=== [Storybook Mode] ${storybookUrl} ===\n`,
    );

    let storybookWebUrl = storybookUrl;
    let localServer;

    if (
      !storybookUrl.startsWith('http://') &&
      !storybookUrl.startsWith('https://')
    ) {
      const staticWebServer = await launchStaticWebServer(storybookUrl);

      storybookWebUrl = staticWebServer.url;
      localServer = staticWebServer.server;
    }

    try {
      const collection = await collectStories(storybookWebUrl);

      if (!collection?.stories || collection.stories.length === 0) {
        throw new Error('Error: Stories not found');
      }

      log.process(
        'info',
        'general',
        `Found ${collection.stories.length} stories`,
      );

      await mapLimit(browsers, 1, async (browser: BrowserType) => {
        const shotItems = generateStorybookShotItems(
          storybookWebUrl,
          collection.stories!,
          mask,
          storybookShots.breakpoints,
          browsers.length > 1 ? browser : undefined,
        );

        const filterItemsToCheck =
          'filterItemsToCheck' in config
            ? config.filterItemsToCheck
            : undefined;

        const filteredShotItems = filterItemsToCheck
          ? shotItems.filter((item) => filterItemsToCheck(item))
          : shotItems;

        storybookShotItems = shotItems;

        log.process(
          'info',
          'general',
          `Prepared ${
            filteredShotItems.length
          } stories for screenshots on ${browser.name()}`,
        );

        await takeScreenShots(filteredShotItems, browser);
      });

      localServer?.close();
    } catch (error: unknown) {
      localServer?.close();
      throw error;
    }

    log.process('info', 'general', 'Screenshots done!');
  }

  if (pageShots) {
    const { pages: pagesFromConfig, baseUrl, mask, breakpoints } = pageShots;

    const pagesFromLoader = await getPagesFromExternalLoader();

    let jsonPages: PageScreenshotParameter[] = pagesFromLoader || [];

    if (config.pageShots?.pagesJsonRefiner) {
      log.process(
        'info',
        'general',
        `🧬 Refining pages received in json with function provided in pagesJsonRefiner`,
      );

      jsonPages = config.pageShots.pagesJsonRefiner(pagesFromLoader || []);
    }

    if (jsonPages.length > 0) {
      log.process(
        'info',
        'general',
        `Found ${jsonPages.length} pages from external loader`,
      );
    }

    const pages = [...(pagesFromConfig || []), ...(jsonPages || [])];

    log.process('info', 'general', `\n=== [Page Mode] ${baseUrl} ===\n`);

    await mapLimit(browsers, 1, async (browser: BrowserType) => {
      const shotItems = generatePageShotItems(
        pages,
        baseUrl,
        mask,
        breakpoints,
        browsers.length > 1 ? browser : undefined,
      );

      pageShotItems = shotItems;

      log.process(
        'info',
        'general',
        `Prepared ${
          shotItems.length
        } pages for screenshots on ${browser.name()}`,
      );

      await takeScreenShots(shotItems, browser);
    });

    log.process('info', 'general', 'Screenshots done!');
  }

  if (customShots) {
    const { currentShotsPath } = customShots;

    log.process(
      'info',
      'general',
      `\n=== [Custom Mode] ${currentShotsPath} ===\n`,
    );

    customShotItems = readDirIntoShotItems(currentShotsPath);
    log.process(
      'info',
      'general',
      `Found ${customShotItems.length} custom shots`,
    );
  }

  return [
    ...storybookShotItems,
    ...pageShotItems,
    ...ladleShotItems,
    ...histoireShotItems,
    ...customShotItems,
  ];
};
