import { Client, GatewayIntentBits, REST, Routes } from 'discord.js'

import { commands, handle } from './commands.js'
import { clientId, guildId, token } from './env.js'

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
}

void main()
