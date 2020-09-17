// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import * as path from 'path';
import { loadJSON } from './utils';
import { loadArtifactsProxyConfig, ArtifactsProxyConfig } from './handlers/artifacts';
export const BASEPATH = '/pipeline';
export const apiVersion = 'v1beta1';
export const apiVersionPrefix = `apis/${apiVersion}`;

export enum Deployments {
  NOT_SPECIFIED = 'NOT_SPECIFIED',
  KUBEFLOW = 'KUBEFLOW',
  MARKETPLACE = 'MARKETPLACE',
}

/** converts string to bool */
const asBool = (value: string) => ['true', '1'].includes(value.toLowerCase());

function parseArgs(argv: string[]) {
  if (argv.length < 3) {
    const msg = `\
  Usage: node server.js <static-dir> [port].
         You can specify the API server address using the
         ML_PIPELINE_SERVICE_HOST and ML_PIPELINE_SERVICE_PORT
         env vars.`;
    throw new Error(msg);
  }

  const staticDir = path.resolve(argv[2]);
  const port = parseInt(argv[3] || '3000', 10);
  return { staticDir, port };
}

export type ProcessEnv = NodeJS.ProcessEnv | { [key: string]: string };

export function loadConfigs(argv: string[], env: ProcessEnv): UIConfigs {
  const { staticDir, port } = parseArgs(argv);
  /** All configurable environment variables can be found here. */
  const {
    /** minio client use these to retrieve minio objects/artifacts */
    MINIO_ACCESS_KEY = 'minio',
    MINIO_SECRET_KEY = 'minio123',
    MINIO_PORT = '9000',
    MINIO_HOST = 'minio-service',
    MINIO_NAMESPACE = 'kubeflow',
    MINIO_SSL = 'false',
    /** minio client use these to retrieve s3 objects/artifacts */
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    /** http/https base URL */
    HTTP_BASE_URL = '',
    /** http/https fetch with this authorization header key (for example: 'Authorization') */
    HTTP_AUTHORIZATION_KEY = '',
    /** http/https fetch with this authorization header value by default when absent in client request at above key */
    HTTP_AUTHORIZATION_DEFAULT_VALUE = '',
    /** API service will listen to this host */
    ML_PIPELINE_SERVICE_HOST = 'localhost',
    /** API service will listen to this port */
    ML_PIPELINE_SERVICE_PORT = '3001',
    /** path to viewer:tensorboard pod template spec */
    VIEWER_TENSORBOARD_POD_TEMPLATE_SPEC_PATH,
    /** Tensorflow image used for tensorboard viewer */
    VIEWER_TENSORBOARD_TF_IMAGE_NAME = 'tensorflow/tensorflow',
    /** Whether custom visualizations are allowed to be generated by the frontend */
    ALLOW_CUSTOM_VISUALIZATIONS = 'false',
    /** Envoy service will listen to this host */
    METADATA_ENVOY_SERVICE_SERVICE_HOST = 'localhost',
    /** Envoy service will listen to this port */
    METADATA_ENVOY_SERVICE_SERVICE_PORT = '9090',
    /** Is Argo log archive enabled? */
    ARGO_ARCHIVE_LOGS = 'false',
    /** Use minio or s3 client to retrieve archives. */
    ARGO_ARCHIVE_ARTIFACTORY = 'minio',
    /** Bucket to retrive logs from */
    ARGO_ARCHIVE_BUCKETNAME = 'mlpipeline',
    /** Prefix to logs. */
    ARGO_ARCHIVE_PREFIX = 'logs',
    /** Should use server API for log streaming? */
    STREAM_LOGS_FROM_SERVER_API = 'false',
    /** Disables GKE metadata endpoint. */
    DISABLE_GKE_METADATA = 'false',
    /** Enable authorization checks for multi user mode. */
    ENABLE_AUTHZ = 'false',
    /** Deployment type. */
    DEPLOYMENT: DEPLOYMENT_STR = '',
    /**
     * A header user requests have when authenticated. It carries user identity information.
     * The default value works with Google Cloud IAP.
     */
    KUBEFLOW_USERID_HEADER = 'x-goog-authenticated-user-email',
    /**
     * KUBEFLOW_USERID_HEADER's value may have a prefix before user identity.
     * Use this header to specify what the prefix is.
     *
     * e.g. a valid header value for default values can be like `accounts.google.com:user@gmail.com`.
     */
    KUBEFLOW_USERID_PREFIX = 'accounts.google.com:',
  } = env;

  return {
    argo: {
      archiveArtifactory: ARGO_ARCHIVE_ARTIFACTORY,
      archiveBucketName: ARGO_ARCHIVE_BUCKETNAME,
      archiveLogs: asBool(ARGO_ARCHIVE_LOGS),
      archivePrefix: ARGO_ARCHIVE_PREFIX,
    },
    artifacts: {
      aws: {
        accessKey: AWS_ACCESS_KEY_ID || '',
        endPoint: 's3.amazonaws.com',
        secretKey: AWS_SECRET_ACCESS_KEY || '',
      },
      http: {
        auth: {
          defaultValue: HTTP_AUTHORIZATION_DEFAULT_VALUE,
          key: HTTP_AUTHORIZATION_KEY,
        },
        baseUrl: HTTP_BASE_URL,
      },
      minio: {
        accessKey: MINIO_ACCESS_KEY,
        endPoint:
          MINIO_NAMESPACE && MINIO_NAMESPACE.length > 0
            ? `${MINIO_HOST}.${MINIO_NAMESPACE}`
            : MINIO_HOST,
        port: parseInt(MINIO_PORT, 10),
        secretKey: MINIO_SECRET_KEY,
        useSSL: asBool(MINIO_SSL),
      },
      proxy: loadArtifactsProxyConfig(env),
      streamLogsFromServerApi: asBool(STREAM_LOGS_FROM_SERVER_API),
    },
    metadata: {
      envoyService: {
        host: METADATA_ENVOY_SERVICE_SERVICE_HOST,
        port: METADATA_ENVOY_SERVICE_SERVICE_PORT,
      },
    },
    pipeline: {
      host: ML_PIPELINE_SERVICE_HOST,
      port: ML_PIPELINE_SERVICE_PORT,
    },
    server: {
      apiVersionPrefix,
      basePath: BASEPATH,
      deployment:
        DEPLOYMENT_STR.toUpperCase() === Deployments.KUBEFLOW
          ? Deployments.KUBEFLOW
          : DEPLOYMENT_STR.toUpperCase() === Deployments.MARKETPLACE
          ? Deployments.MARKETPLACE
          : Deployments.NOT_SPECIFIED,
      port,
      staticDir,
    },
    viewer: {
      tensorboard: {
        podTemplateSpec: loadJSON<object>(VIEWER_TENSORBOARD_POD_TEMPLATE_SPEC_PATH),
        tfImageName: VIEWER_TENSORBOARD_TF_IMAGE_NAME,
      },
    },
    visualizations: {
      allowCustomVisualizations: asBool(ALLOW_CUSTOM_VISUALIZATIONS),
    },
    gkeMetadata: {
      disabled: asBool(DISABLE_GKE_METADATA),
    },
    auth: {
      enabled: asBool(ENABLE_AUTHZ),
      kubeflowUserIdHeader: KUBEFLOW_USERID_HEADER,
      kubeflowUserIdPrefix: KUBEFLOW_USERID_PREFIX,
    },
  };
}

export interface MinioConfigs {
  accessKey: string;
  secretKey: string;
  endPoint: string;
  port: number;
  useSSL: boolean;
}
export interface AWSConfigs {
  endPoint: string;
  accessKey: string;
  secretKey: string;
}
export interface HttpConfigs {
  baseUrl: string;
  auth: {
    key: string;
    defaultValue: string;
  };
}
export interface PipelineConfigs {
  host: string;
  port: string | number;
}
export interface ViewerTensorboardConfig {
  podTemplateSpec?: object;
  tfImageName: string;
}
export interface ViewerConfigs {
  tensorboard: ViewerTensorboardConfig;
}
export interface VisualizationsConfigs {
  allowCustomVisualizations: boolean;
}
export interface MetadataConfigs {
  envoyService: {
    host: string;
    port: string | number;
  };
}
export interface ArgoConfigs {
  archiveLogs: boolean;
  archiveArtifactory: string;
  archiveBucketName: string;
  archivePrefix: string;
}
export interface ServerConfigs {
  basePath: string;
  port: string | number;
  staticDir: string;
  apiVersionPrefix: string;
  deployment: Deployments;
}
export interface GkeMetadataConfigs {
  disabled: boolean;
}
export interface AuthConfigs {
  enabled: boolean;
  kubeflowUserIdHeader: string;
  kubeflowUserIdPrefix: string;
}
export interface UIConfigs {
  server: ServerConfigs;
  artifacts: {
    aws: AWSConfigs;
    minio: MinioConfigs;
    http: HttpConfigs;
    proxy: ArtifactsProxyConfig;
    streamLogsFromServerApi: boolean;
  };
  argo: ArgoConfigs;
  metadata: MetadataConfigs;
  visualizations: VisualizationsConfigs;
  viewer: ViewerConfigs;
  pipeline: PipelineConfigs;
  gkeMetadata: GkeMetadataConfigs;
  auth: AuthConfigs;
}
