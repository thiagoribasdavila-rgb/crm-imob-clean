"use client";

import { useEffect, useState, useMemo } from "react";
import LeadsTable from "./LeadsTable";
import LeadFilters from "./LeadFilters";
import LeadActions from "./LeadActions";
import LeadCreateModal from "./modals/LeadCreateModal";
import LeadEditModal from "./modals/LeadEditModal";
import LeadDeleteModal from "./modals/LeadDeleteModal";

type Lead = {
  id: number;
  name: string;
  email: string;
  status: "Novo" | "Contato" | "Negociando" | "Fechado";
  source: string;
  createdAt: string;
};

export default function LeadsContainer() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  // 🔥 MOCK (depois troca por Supabase)
  useEffect(() => {
    const fetchLeads = async () => {
      setLoading(true);

      const data: Lead[] = [
        {
          id: 1,
          name: "João Silva",
          email: "joao@email.com",
          status: "Novo",
          source: "Meta Ads",
          createdAt: "2026-06-29",
        },
        {
          id: 2,
          name: "Maria Santos",
          email: "maria@email.com",
          status: "Negociando",
          source: "Site",
          createdAt: "2026-06-28",
        },
      ];

      setTimeout(() => {
        setLeads(data);
        setLoading(false);
      }, 500);
    };

    fetchLeads();
  }, []);

  // 🔍 FILTRO INTELIGENTE
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchSearch =
        lead.name.toLowerCase().includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        statusFilter === "all" ? true : lead.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [leads, search, statusFilter]);

  // ➕ CREATE
  const handleCreate = (newLead: Lead) => {
    setLeads((prev) => [newLead, ...prev]);
    setOpenCreate(false);
  };

  // ✏️ EDIT
  const handleEdit = (updated: Lead) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === updated.id ? updated : l))
    );
    setOpenEdit(false);
    setSelectedLead(null);
  };

  // 🗑 DELETE
  const handleDelete = (id: number) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setOpenDelete(false);
    setSelectedLead(null);
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-500">Carregando leads...</div>
    );
  }

  return (
    <div className="space-y-4 p-6">

      {/* HEADER AÇÕES */}
      <LeadActions
        onCreate={() => setOpenCreate(true)}
      />

      {/* FILTROS */}
      <LeadFilters
        search={search}
        setSearch={setSearch}
        status={statusFilter}
        setStatus={setStatusFilter}
      />

      {/* TABELA */}
      <LeadsTable
        leads={filteredLeads}
        onEdit={(lead) => {
          setSelectedLead(lead);
          setOpenEdit(true);
        }}
        onDelete={(lead) => {
          setSelectedLead(lead);
          setOpenDelete(true);
        }}
      />

      {/* MODALS */}
      <LeadCreateModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSave={handleCreate}
      />

      <LeadEditModal
        open={openEdit}
        lead={selectedLead}
        onClose={() => setOpenEdit(false)}
        onSave={handleEdit}
      />

      <LeadDeleteModal
        open={openDelete}
        lead={selectedLead}
        onClose={() => setOpenDelete(false)}
        onConfirm={() =>
          selectedLead && handleDelete(selectedLead.id)
        }
      />
    </div>
  );
}
