import { z } from 'zod'

export const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    API_PORT: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    API_TOKEN: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    IDLE_MINUTES: z.string().optional(),
    GAME_HOST: z.enum(['local', 'azure']).optional(),
    ECLIPSE_INSTANCES_DIR: z.string().optional(),
    MC_CONTAINER_NAME: z.string().optional(),
    MC_COMPOSE_FILE: z.string().optional(),
    RCON_HOST: z.string().optional(),
    RCON_PORT: z.string().optional(),
    RCON_PASSWORD: z.string().optional(),
    BACKUP_DIR: z.string().optional(),
    JOIN_HOST: z.string().optional(),
    JOIN_PORT: z.string().optional(),
    PUBLIC_IP: z.string().optional(),
    CF_API_KEY: z.string().optional(),
    DOCKER_HOST: z.string().optional(),
    SSH_PRIVATE_KEY_PATH: z.string().optional(),
    AZURE_SUBSCRIPTION_ID: z.string().optional(),
    AZURE_RESOURCE_GROUP: z.string().optional(),
    AZURE_VM_NAME: z.string().optional(),
    AZURE_BACKUP_CONNECTION_STRING: z.string().optional(),
    AZURE_BACKUP_CONTAINER: z.string().optional(),
    AZURE_BACKUP_ACCOUNT_URL: z.string().optional()
  })
  .superRefine((data, ctx) => {
    const nodeEnv = data.NODE_ENV ?? process.env.NODE_ENV
    const apiToken = data.API_TOKEN ?? 'dev-api-token-change-me'
    const rconPassword = data.RCON_PASSWORD ?? 'eclipse'
    const gameHost = data.GAME_HOST ?? 'local'

    if (nodeEnv === 'production') {
      if (apiToken === 'dev-api-token-change-me') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['API_TOKEN'],
          message:
            'API_TOKEN must not be the default value in production'
        })
      }
      if (rconPassword === 'eclipse') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RCON_PASSWORD'],
          message:
            'RCON_PASSWORD must not be the default value in production'
        })
      }
    }

    if (gameHost === 'azure') {
      for (const key of [
        'AZURE_RESOURCE_GROUP',
        'AZURE_VM_NAME',
        'DOCKER_HOST',
        'SSH_PRIVATE_KEY_PATH'
      ] as const) {
        if (!data[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when GAME_HOST=azure`
          })
        }
      }
    }
  })

export type RawEnv = z.infer<typeof envSchema>
