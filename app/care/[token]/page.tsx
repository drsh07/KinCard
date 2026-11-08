import CareView from "../../ui/CareView";
export default async function CarePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CareView token={token} />;
}
