import type { GameHost, GameHostConfig } from '../types'

import { ComputeManagementClient } from '@azure/arm-compute'
import { DefaultAzureCredential } from '@azure/identity'

import type { ServerStatus } from '@eclipse/shared'

import { DockerComposeHost } from '../docker/compose-host'
import type { SshFs } from '../ssh/ssh-fs'

export type AzureVmConfig = GameHostConfig & {
  subscriptionId: string
  resourceGroup: string
  vmName: string
  manageVmPower: boolean
}

export class AzureVmDockerHost implements GameHost {
  private readonly local: DockerComposeHost
  private client: ComputeManagementClient | null = null

  constructor(private readonly config: AzureVmConfig) {
    this.local = new DockerComposeHost(config)
    if (config.subscriptionId) {
      this.client = new ComputeManagementClient(
        new DefaultAzureCredential(),
        config.subscriptionId
      )
    }
  }

  getSshFs(): SshFs | null {
    return this.local.getSshFs()
  }

  async ensureVmRunning(): Promise<void> {
    if (!this.config.manageVmPower || !this.client) return

    const instanceView = await this.client.virtualMachines.instanceView(
      this.config.resourceGroup,
      this.config.vmName
    )
    const power = instanceView.statuses?.find((s) =>
      s.code?.startsWith('PowerState/')
    )
    const code = power?.code ?? ''
    if (!code.includes('running')) {
      const poller = await this.client.virtualMachines.beginStart(
        this.config.resourceGroup,
        this.config.vmName
      )
      await poller.pollUntilDone()
    }

    const ssh = this.local.getSshFs()
    if (ssh) await ssh.waitUntilReady({ timeoutMs: 180_000 })
  }

  async deallocateIfIdle(): Promise<void> {
    if (!this.config.manageVmPower || !this.client) return
    const poller = await this.client.virtualMachines.beginDeallocate(
      this.config.resourceGroup,
      this.config.vmName
    )
    await poller.pollUntilDone()
  }

  async start(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void> {
    await this.ensureVmRunning()
    await this.local.start(instanceId, dataPath, env)
  }

  async stop(): Promise<void> {
    await this.local.stop()
    await this.deallocateIfIdle()
  }

  async restart(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void> {
    await this.ensureVmRunning()
    await this.local.restart(instanceId, dataPath, env)
  }

  async switchInstance(
    instanceId: string,
    dataPath: string,
    env?: Record<string, string>
  ): Promise<void> {
    await this.ensureVmRunning()
    await this.local.switchInstance(instanceId, dataPath, env)
  }

  async getStatus(activeInstanceId: string | null): Promise<ServerStatus> {
    let vmPowerState: ServerStatus['vmPowerState'] = 'unknown'
    if (this.client) {
      try {
        const instanceView = await this.client.virtualMachines.instanceView(
          this.config.resourceGroup,
          this.config.vmName
        )
        const power = instanceView.statuses?.find(s =>
          s.code?.startsWith('PowerState/')
        )
        const code = power?.code ?? ''
        if (code.includes('running')) vmPowerState = 'running'
        else if (code.includes('deallocated')) vmPowerState = 'deallocated'
      } catch {
        vmPowerState = 'unknown'
      }
    }

    if (vmPowerState === 'deallocated') {
      return {
        container: 'missing',
        activeInstanceId,
        playersOnline: 0,
        vmPowerState
      }
    }

    const status = await this.local.getStatus(activeInstanceId)
    return { ...status, vmPowerState }
  }

  streamLogs() {
    return this.local.streamLogs()
  }

  execRcon(command: string) {
    return this.local.execRcon(command)
  }

  listMods(dataPath: string) {
    return this.local.listMods(dataPath)
  }
}
