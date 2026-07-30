import { InstanceDetail } from '@/components/instance-detail'

export default async function InstancePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <InstanceDetail instanceId={id} />
}
