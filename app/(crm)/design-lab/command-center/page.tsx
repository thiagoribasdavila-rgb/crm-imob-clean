import type { Metadata } from "next";
import { CommandCenterConcepts } from "@/components/design-lab/command-center-concepts";

export const metadata: Metadata = {
  title: "Laboratório da Sala de Comando | Atlas One",
  description: "Cinco direções de experiência para a nova Sala de Comando Atlas One.",
};

export default function CommandCenterDesignLabPage() {
  return <CommandCenterConcepts />;
}
