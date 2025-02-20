import path from 'node:path';
import axios from 'axios';
import type { BrowserType } from 'playwright-core';
import { log } from '../log';
import { config, isPlatformModeConfig } from '../config';
import { type ShotItem } from '../types';
import { notSupported } from '../constants';
import { generateLabel, selectBreakpoints } from '../shots/utils';

type HistoireStory = {
  id: string;
  title: string;
  group: string | undefined;
  layout: {
    type: string;
    width: string;
  };
  variants?: HistoireStory[];
};

type HistoireResponse = {
  stories: HistoireStory[];
};

const generateShotItemsForStory = (
  story: HistoireStory,
  baseUrl: string,
  modeBreakpoints?: number[],
  browser?: BrowserType,
): ShotItem[] => {
  const shotItems: ShotItem[] = [];

  // Treat stories without variants as if they had a single variant
  const variants = story.variants ?? [story];
  const breakpoints = selectBreakpoints(config.breakpoints, modeBreakpoints);

  for (const variant of variants) {
    const shotName =
      config.shotNameGenerator?.({ ...variant, shotMode: 'histoire' }) ??
      `${story.id}_${variant.title}`;
    const shotItemBase: ShotItem = {
      shotMode: 'histoire',
      url: `${baseUrl}/__sandbox.html?storyId=${story.id}&variantId=${variant.id}`,
      threshold: config.threshold,
      waitForSelector: config?.histoireShots?.waitForSelector,
    };
    if (breakpoints.length === 0) {
      const label = generateLabel({ browser });
      const fileNameWithExt = `${shotName}${label}.png`;
      shotItems.push({
        ...shotItemBase,
        id: `${story.id}_${variant.id}${label}`,
        shotName: `${shotName}${label}`,
        filePathBaseline: isPlatformModeConfig(config)
          ? notSupported
          : path.join(config.imagePathBaseline, fileNameWithExt),
        filePathCurrent: path.join(config.imagePathCurrent, fileNameWithExt),
        filePathDifference: isPlatformModeConfig(config)
          ? notSupported
          : path.join(config.imagePathDifference, fileNameWithExt),
      });
    } else {
      for (const breakpoint of breakpoints) {
        const label = generateLabel({ breakpoint, browser });
        const fileNameWithExt = `${shotName}${label}.png`;
        shotItems.push({
          ...shotItemBase,
          id: `${story.id}_${variant.id}${label}`,
          shotName: `${shotName}${label}`,
          breakpoint,
          filePathBaseline: isPlatformModeConfig(config)
            ? notSupported
            : path.join(config.imagePathBaseline, fileNameWithExt),
          filePathCurrent: path.join(config.imagePathCurrent, fileNameWithExt),
          filePathDifference: isPlatformModeConfig(config)
            ? notSupported
            : path.join(config.imagePathDifference, fileNameWithExt),
          viewport: { width: breakpoint },
        });
      }
    }
  }

  return shotItems.filter((story) => story.id !== 'full-config');
};

export const generateHistoireShotItems = (
  baseUrl: string,
  stories: HistoireStory[],
  modeBreakpoints?: number[],
  browser?: BrowserType,
): ShotItem[] => {
  return stories.flatMap((story) => {
    return generateShotItemsForStory(story, baseUrl, modeBreakpoints, browser);
  });
};

export const collectHistoireStories = async (histoireUrl: string) => {
  const jsonUrl = `${histoireUrl}/histoire.json`;

  log.process('info', 'general', `\n=== [Histoire Mode] ${jsonUrl} ===\n`);
  const response = await axios.get<HistoireResponse>(jsonUrl);

  // Ignore the full-config story from Histoire as it is just JSON
  return response.data.stories;
};
