import {
  ChatInputCommandInteraction,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js'
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '../../.env') })
config()

const token = process.env.DISCORD_TOKEN
const clientId = process.env.DISCORD_CLIENT_ID
const guildId = process.env.DISCORD_GUILD_ID
const apiUrl = process.env.API_URL ?? 'http://localhost:4000'
const apiToken = process.env.API_TOKEN ?? 'dev-api-token-change-me'
const adminIds = new Set(
  (process.env.DISCORD_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)
const notifyChannelId = process.env.DISCORD_NOTIFY_CHANNEL_ID

async function api(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Bearer ${apiToken}`)
  const res = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(
      typeof json === 'object' && json && 'error' in json
        ? String((json as { error: string }).error)
        : text || res.statusText
    )
  }
  return json
}

function isAdmin(userId: string) {
  if (adminIds.size === 0) return true
  return adminIds.has(userId)
}

const commands = [
  new SlashCommandBuilder()
    .setName('mc')
    .setDescription('Eclipse Minecraft controls')
    .addSubcommand((s) => s.setName('status').setDescription('Server status'))
    .addSubcommand((s) => s.setName('start').setDescription('Start server'))
    .addSubcommand((s) => s.setName('stop').setDescription('Stop server'))
    .addSubcommand((s) => s.setName('restart').setDescription('Restart server'))
    .addSubcommand((s) =>
      s
        .setName('switch')
        .setDescription('Switch active instance')
        .addStringOption((o) =>
          o.setName('slug').setDescription('Instance slug').setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName('players').setDescription('Online players'))
    .addSubcommand((s) =>
      s.setName('backup').setDescription('Backup active instance')
    )
    .addSubcommand((s) => s.setName('backups').setDescription('List backups'))
].map((c) => c.toJSON())

async function handle(interaction: ChatInputCommandInteraction) {
  if (!isAdmin(interaction.user.id)) {
    await interaction.reply({ content: 'Not authorized.', ephemeral: true })
    return
  }
  const sub = interaction.options.getSubcommand()
  await interaction.deferReply()
  try {
    if (sub === 'status') {
      const data = (await api('/server/status')) as {
        status: { container: string; playersOnline: number }
        activeInstance: { name: string; slug: string } | null
      }
      await interaction.editReply(
        `**${data.activeInstance?.name ?? 'none'}** (${data.activeInstance?.slug ?? '-'})\n` +
          `Container: \`${data.status.container}\` · Players: ${data.status.playersOnline}`
      )
      return
    }
    if (sub === 'start') {
      await api('/server/start', { method: 'POST' })
      await interaction.editReply('Starting…')
      return
    }
    if (sub === 'stop') {
      await api('/server/stop', { method: 'POST' })
      await interaction.editReply('Stopped.')
      return
    }
    if (sub === 'restart') {
      await api('/server/restart', { method: 'POST' })
      await interaction.editReply('Restarting…')
      return
    }
    if (sub === 'switch') {
      const slug = interaction.options.getString('slug', true)
      const list = (await api('/instances')) as {
        instances: { id: string; slug: string; name: string }[]
      }
      const inst = list.instances.find((i) => i.slug === slug)
      if (!inst) {
        await interaction.editReply(`No instance \`${slug}\``)
        return
      }
      await api(`/instances/${inst.id}/activate`, { method: 'POST' })
      await interaction.editReply(`Switched to **${inst.name}**`)
      return
    }
    if (sub === 'players') {
      const data = (await api('/server/status')) as {
        status: { playersOnline: number }
      }
      const list = (await api('/server/rcon', {
        method: 'POST',
        body: JSON.stringify({ command: 'list' })
      })) as { result: string }
      await interaction.editReply(
        `Online: ${data.status.playersOnline}\n\`\`\`\n${list.result}\n\`\`\``
      )
      return
    }
    if (sub === 'backup') {
      const st = (await api('/server/status')) as {
        activeInstance: { id: string } | null
      }
      if (!st.activeInstance) {
        await interaction.editReply('No active instance')
        return
      }
      const backup = (await api('/backups', {
        method: 'POST',
        body: JSON.stringify({
          instanceId: st.activeInstance.id,
          triggeredBy: `discord:${interaction.user.id}`
        })
      })) as { backup: { id: string; sizeBytes: number } }
      await interaction.editReply(
        `Backup \`${backup.backup.id}\` (${backup.backup.sizeBytes} bytes)`
      )
      return
    }
    if (sub === 'backups') {
      const data = (await api('/backups')) as {
        backups: { id: string; sizeBytes: number; createdAt: string }[]
      }
      const lines = data.backups
        .slice(0, 10)
        .map(
          (b) => `• \`${b.id.slice(0, 8)}\` ${b.sizeBytes}B · ${b.createdAt}`
        )
      await interaction.editReply(lines.join('\n') || 'No backups')
      return
    }
  } catch (err) {
    await interaction.editReply(
      `Error: ${err instanceof Error ? err.message : 'unknown'}`
    )
  }
}

async function main() {
  if (!token || !clientId) {
    console.warn(
      '[bot] DISCORD_TOKEN / DISCORD_CLIENT_ID missing — bot idle (dev OK)'
    )
    setInterval(() => undefined, 60_000)
    return
  }

  const rest = new REST({ version: '10' }).setToken(token)
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands
    })
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands })
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] })
  client.on('ready', () => {
    console.info(`[bot] logged in as ${client.user?.tag}`)
  })
  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return
    if (interaction.commandName !== 'mc') return
    void handle(interaction)
  })
  await client.login(token)

  if (notifyChannelId) {
  }
}

void main()
