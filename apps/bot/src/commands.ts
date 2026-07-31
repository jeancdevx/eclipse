import {
  ChatInputCommandInteraction,
  SlashCommandBuilder
} from 'discord.js'

import { api } from './api-client.js'
import { adminIds } from './env.js'

function isAdmin(userId: string) {
  if (adminIds.size === 0) return true
  return adminIds.has(userId)
}

export const commands = [
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

export async function handle(interaction: ChatInputCommandInteraction) {
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
