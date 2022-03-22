import { readdirSync, readFileSync } from 'fs';
import { UploadFile, WebhookEvent } from './upload';
import { normalize, join } from 'path';

export const imagePathBase = process.env.IMAGE_PATH_BASE || '';

export const relativeImagePathReference =
  process.env.IMAGE_PATH_REFERENCE || '.loki/reference/';

export const imagePathReference = join(
  imagePathBase,
  relativeImagePathReference,
);

export const relativeImagePathCurrent =
  process.env.IMAGE_PATH_CURRENT || '.loki/current/';

export const imagePathCurrent = join(imagePathBase, relativeImagePathCurrent);

export const relativeImagePathDifference =
  process.env.IMAGE_PATH_DIFFERENCE || '.loki/difference/';

export const imagePathDifference = join(
  imagePathBase,
  relativeImagePathDifference,
);

export const log = console.log;

export type Files = {
  reference: string[];
  current: string[];
  difference: string[];
};

export type Changes = {
  difference: string[];
  deletion: string[];
  addition: string[];
};

export const getChanges = (files: Files): Changes => {
  return {
    difference: files.difference.sort(),
    deletion: files.reference
      .filter((file) => !files.current.includes(file))
      .sort(),
    addition: files.current
      .filter((file) => !files.reference.includes(file))
      .sort(),
  };
};

type ExtendFileName = {
  fileName: string;
  extension: 'after' | 'before' | 'difference';
};

export const extendFileName = ({ fileName, extension }: ExtendFileName) => {
  const parts = fileName.split('.').filter((part) => part !== '');
  const extensionIndex = parts.length - 1;

  if (parts.length === 1) {
    return `${extension}.${parts[0]}`;
  } else if (parts.length === 0) {
    return extension;
  }

  parts[extensionIndex] = `${extension}.${parts[extensionIndex]}`;

  return parts.join('.');
};

type ComparisonType = 'ADDITION' | 'DELETION' | 'DIFFERENCE';

type CreateUploadItem = {
  uploadFileName: string;
  path: string;
  fileName: string;
  type: ComparisonType;
};

const createUploadItem = ({
  uploadFileName,
  path,
  fileName,
  type,
}: CreateUploadItem): UploadFile => {
  const filePath = normalize(join(path, fileName));

  return {
    uploadPath: join(
      process.env.LOST_PIXEL_PROJECT_ID || 'none',
      process.env.CI_BUILD_ID || '1',
      uploadFileName,
    ),
    filePath,
    metaData: {
      'content-type': 'image/png',
      'x-amz-acl': 'public-read',
      type,
      original: filePath,
    },
  };
};

export type Comparison = {
  beforeImageUrl?: string;
  afterImageUrl?: string;
  differenceImageUrl?: string;
  type: ComparisonType;
  path: string;
};

type PrepareComparisonList = {
  changes: Changes;
  baseUrl: string;
};

export const prepareComparisonList = ({
  changes,
  baseUrl,
}: PrepareComparisonList): [Comparison[], UploadFile[]] => {
  const comparisonList: Comparison[] = [];
  const uploadList: UploadFile[] = [];

  changes.addition.forEach((fileName) => {
    const afterFile = extendFileName({
      fileName,
      extension: 'after',
    });
    const type = 'ADDITION';

    comparisonList.push({
      type,
      afterImageUrl: [baseUrl, afterFile].join('/'),
      path: join(imagePathReference, fileName),
    });

    uploadList.push(
      createUploadItem({
        uploadFileName: afterFile,
        path: imagePathCurrent,
        fileName,
        type,
      }),
    );
  });

  changes.deletion.forEach((fileName) => {
    const beforeFile = extendFileName({
      fileName,
      extension: 'before',
    });
    const type = 'DELETION';

    comparisonList.push({
      type,
      beforeImageUrl: [baseUrl, beforeFile].join('/'),
      path: join(imagePathReference, fileName),
    });

    uploadList.push(
      createUploadItem({
        uploadFileName: beforeFile,
        path: imagePathReference,
        fileName,
        type,
      }),
    );
  });

  changes.difference.forEach((fileName) => {
    const beforeFile = extendFileName({
      fileName,
      extension: 'before',
    });
    const afterFile = extendFileName({
      fileName,
      extension: 'after',
    });
    const differenceFile = extendFileName({
      fileName,
      extension: 'difference',
    });
    const type = 'DIFFERENCE';

    comparisonList.push({
      type,
      beforeImageUrl: [baseUrl, beforeFile].join('/'),
      afterImageUrl: [baseUrl, afterFile].join('/'),
      differenceImageUrl: [baseUrl, differenceFile].join('/'),
      path: join(imagePathReference, fileName),
    });

    uploadList.push(
      createUploadItem({
        uploadFileName: beforeFile,
        path: imagePathReference,
        fileName,
        type,
      }),
    );

    uploadList.push(
      createUploadItem({
        uploadFileName: afterFile,
        path: imagePathCurrent,
        fileName,
        type,
      }),
    );

    uploadList.push(
      createUploadItem({
        uploadFileName: differenceFile,
        path: imagePathDifference,
        fileName,
        type,
      }),
    );
  });

  return [comparisonList, uploadList];
};

export const getImageList = (path: string): string[] | null => {
  try {
    const files = readdirSync(path);

    return files.filter((name) => name.endsWith('.png'));
  } catch (error) {
    log(error);
    return null;
  }
};

export const getEventData = (path: string): WebhookEvent | undefined => {
  try {
    return require(path);
  } catch (error) {
    log(error);
    return undefined;
  }
};
