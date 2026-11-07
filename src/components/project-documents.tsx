import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, EyeOff, FileText, FolderOpen, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BUCKET = "project-files";
const MAX_BYTES = 50 * 1024 * 1024; // igual ao limite do bucket
const DEFAULT_FOLDERS = [
  "Contratos",
  "Briefing",
  "Layouts",
  "Entregas",
  "Acervo de repositórios",
  "Geral",
];
const NEW_FOLDER = "__nova";

type ProjectFile = {
  id: string;
  folder: string;
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  description: string | null;
  created_at: string;
  client_visible: boolean;
};

function formatSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Nome seguro para o caminho no storage; o nome original fica nos metadados. */
function safeName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(-120) || "arquivo";
}

/**
 * Documentos da pasta do projeto, organizados em pastas.
 * Quem vê e quem envia é decidido pelo banco (RLS da tabela project_files e do bucket project-files);
 * a tela apenas esconde os botões de envio e exclusão de quem não pode editar.
 */
export function ProjectDocuments({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderChoice, setFolderChoice] = useState("Contratos");
  const [newFolder, setNewFolder] = useState("");
  const [filter, setFilter] = useState<string>("__todas");
  const [files, setFiles] = useState<File[]>([]);

  const queryKey = ["project-files", projectId];
  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_files")
        .select(
          "id,folder,file_name,storage_path,size_bytes,mime_type,description,created_at,client_visible",
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectFile[];
    },
  });

  const folders = useMemo(() => {
    const used = Array.from(new Set(rows.map((r) => r.folder)));
    return Array.from(new Set([...DEFAULT_FOLDERS, ...used]));
  }, [rows]);
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectFile[]>();
    for (const r of rows) {
      if (filter !== "__todas" && r.folder !== filter) continue;
      map.set(r.folder, [...(map.get(r.folder) ?? []), r]);
    }
    return Array.from(map.entries()).sort((a, b) => folders.indexOf(a[0]) - folders.indexOf(b[0]));
  }, [rows, filter, folders]);

  const targetFolder = folderChoice === NEW_FOLDER ? newFolder.trim() : folderChoice;

  const upload = useMutation({
    mutationFn: async () => {
      if (!targetFolder) throw new Error("Informe o nome da nova pasta.");
      const tooBig = files.find((f) => f.size > MAX_BYTES);
      if (tooBig) throw new Error(`"${tooBig.name}" passa de 50 MB.`);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre novamente.");
      for (const file of files) {
        const path = `${projectId}/${crypto.randomUUID()}-${safeName(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) throw new Error(`Falha ao enviar "${file.name}".`);
        const { error: dbErr } = await supabase.from("project_files").insert({
          project_id: projectId,
          folder: targetFolder,
          file_name: file.name.slice(0, 255),
          storage_path: path,
          size_bytes: file.size,
          mime_type: file.type || null,
          created_by: uid,
        });
        if (dbErr) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw new Error(`Falha ao registrar "${file.name}".`);
        }
      }
    },
    onSuccess: () => {
      toast.success(files.length > 1 ? `${files.length} arquivos enviados.` : "Arquivo enviado.");
      setFiles([]);
      setNewFolder("");
      if (folderChoice === NEW_FOLDER) setFolderChoice(targetFolder);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível enviar."),
  });

  // Fase 4: compartilhar (ou não) o documento no Portal do Cliente.
  const shareClient = useMutation({
    mutationFn: async (f: ProjectFile) => {
      const { error } = await supabase
        .from("project_files")
        .update({ client_visible: !f.client_visible })
        .eq("id", f.id);
      if (error) throw error;
      return !f.client_visible;
    },
    onSuccess: (v) => {
      toast.success(
        v ? "Documento compartilhado com o cliente." : "Documento deixou de ser compartilhado.",
      );
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (f: ProjectFile) => {
      const { error } = await supabase.from("project_files").delete().eq("id", f.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([f.storage_path]);
    },
    onSuccess: () => {
      toast.success("Arquivo excluído.");
      qc.invalidateQueries({ queryKey });
    },
    onError: () => toast.error("Não foi possível excluir o arquivo."),
  });

  const download = async (f: ProjectFile) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(f.storage_path, 60, {
        download: f.file_name,
      });
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" /> Enviar arquivos
          </h3>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div className="space-y-1">
              <Label htmlFor="doc-folder">Pasta</Label>
              <Select value={folderChoice} onValueChange={setFolderChoice}>
                <SelectTrigger id="doc-folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_FOLDER}>+ Nova pasta…</SelectItem>
                </SelectContent>
              </Select>
              {folderChoice === NEW_FOLDER && (
                <Input
                  aria-label="Nome da nova pasta"
                  placeholder="Nome da nova pasta"
                  maxLength={60}
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-1 min-w-0">
              <Label htmlFor="doc-files">Arquivos (até 50 MB cada)</Label>
              <Input
                id="doc-files"
                ref={inputRef}
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {files.length
                ? `${files.length} arquivo(s) selecionado(s) para "${targetFolder || "…"}"`
                : "Nenhum arquivo selecionado."}
            </span>
            <Button
              onClick={() => upload.mutate()}
              disabled={!files.length || !targetFolder || upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {upload.isPending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <div role="group" aria-label="Filtrar por pasta" className="flex flex-wrap gap-1.5">
          {["__todas", ...folders.filter((f) => rows.some((r) => r.folder === f))].map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f)}
                className={`min-h-9 rounded-full border px-3 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent"
                }`}
              >
                {f === "__todas"
                  ? `Todas (${rows.length})`
                  : `${f} (${rows.filter((r) => r.folder === f).length})`}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando documentos…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os documentos.
        </p>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <FolderOpen className="h-8 w-8 mx-auto mb-2" />
          Nenhum documento neste projeto ainda.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {grouped.map(([folder, items]) => (
            <Card key={folder} className="p-4 space-y-2 min-w-0">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" /> {folder}
                <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
              </h3>
              <ul className="divide-y">
                {items.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 py-2">
                    <FileText
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm" title={f.file_name}>
                        {f.file_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(f.size_bytes)} ·{" "}
                        {new Date(f.created_at).toLocaleDateString("pt-BR")}
                        {f.client_visible && (
                          <span className="ml-1 font-medium text-primary">· Cliente vê</span>
                        )}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Baixar ${f.file_name}`}
                      title="Baixar"
                      onClick={() => void download(f)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-pressed={f.client_visible}
                        aria-label={
                          f.client_visible
                            ? `Parar de compartilhar ${f.file_name} com o cliente`
                            : `Compartilhar ${f.file_name} com o cliente`
                        }
                        title={
                          f.client_visible
                            ? "Parar de compartilhar com o cliente"
                            : "Compartilhar com o cliente"
                        }
                        disabled={shareClient.isPending}
                        onClick={() => shareClient.mutate(f)}
                      >
                        {f.client_visible ? (
                          <Eye className="h-4 w-4 text-primary" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Excluir ${f.file_name}`}
                        title="Excluir"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`Excluir "${f.file_name}"? Esta ação não pode ser desfeita.`))
                            remove.mutate(f);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
