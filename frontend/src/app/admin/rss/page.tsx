"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Rss,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  Globe,
  ArrowLeft,
  MousePointer,
  Eye,
  Loader2,
  X,
} from "lucide-react";
import { rssApi, type RSSFeed } from "@/lib/api";

// ─── Tipos ──────────────────────────────────────────────────────────────────
type SelectorField = "container" | "link" | "title" | "description" | "image" | "date" | "author";

interface Selectors {
  container: string;
  link: string;
  title?: string;
  description?: string;
  image?: string;
  date?: string;
  author?: string;
}

interface PreviewItem {
  title?: string;
  link?: string;
  description?: string;
  image_url?: string;
  pub_date?: string;
  author?: string;
}

const FIELD_LABELS: Record<SelectorField, { label: string; required: boolean; hint: string }> = {
  container: { label: "Container", required: true, hint: "Elemento que se repete para cada item" },
  link: { label: "Link", required: true, hint: "Elemento <a> com o href do item" },
  title: { label: "Titulo", required: false, hint: "Texto do titulo do item" },
  description: { label: "Descricao", required: false, hint: "Texto de descricao/resumo" },
  image: { label: "Imagem", required: false, hint: "Elemento <img> com a imagem" },
  date: { label: "Data", required: false, hint: "Data de publicacao" },
  author: { label: "Autor", required: false, hint: "Nome do autor" },
};

const REFRESH_OPTIONS = [
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 360, label: "6 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "24 horas" },
];

// ─── Componente principal ───────────────────────────────────────────────────
export default function RSSPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const queryClient = useQueryClient();

  const { data: feeds, isLoading } = useQuery({
    queryKey: ["rss-feeds"],
    queryFn: () => rssApi.list().then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rssApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rss-feeds"] });
      toast.success("Feed RSS removido");
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: (id: string) => rssApi.scrape(id),
    onSuccess: () => {
      toast.success("Scraping enfileirado");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["rss-feeds"] }), 3000);
    },
  });

  const copyXmlUrl = (id: string) => {
    navigator.clipboard.writeText(rssApi.xmlUrl(id));
    toast.success("URL do XML copiada");
  };

  if (showBuilder) {
    return (
      <RSSBuilder
        onBack={() => setShowBuilder(false)}
        onCreated={() => {
          setShowBuilder(false);
          queryClient.invalidateQueries({ queryKey: ["rss-feeds"] });
        }}
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rss className="w-6 h-6" />
            RSS Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie feeds RSS a partir de qualquer site
          </p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" />
          Novo Feed
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : !feeds?.length ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <Rss className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum feed RSS criado</p>
          <button
            onClick={() => setShowBuilder(true)}
            className="mt-4 text-sm text-primary hover:text-primary/80"
          >
            Criar primeiro feed
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {feeds.map((feed) => (
            <div
              key={feed.id}
              className="bg-card rounded-xl border border-border p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-400/10 flex items-center justify-center flex-shrink-0">
                <Rss className="w-5 h-5 text-orange-400" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">{feed.name}</h3>
                  {feed.is_active ? (
                    <span className="flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Ativo
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground/70 mt-1">
                  <span className="flex items-center gap-1 truncate">
                    <Globe className="w-3 h-3" />
                    {feed.source_url}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {REFRESH_OPTIONS.find((o) => o.value === feed.refresh_interval)?.label || `${feed.refresh_interval}min`}
                  </span>
                  <span>{feed.item_count} itens</span>
                  {feed.last_scraped_at && (
                    <span>
                      Atualizado: {new Date(feed.last_scraped_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
                {feed.last_error && (
                  <div className="flex items-center gap-1 text-xs text-destructive mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {feed.last_error.slice(0, 100)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => scrapeMutation.mutate(feed.id)}
                  className="p-2 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded-lg transition"
                  title="Atualizar agora"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => copyXmlUrl(feed.id)}
                  className="p-2 text-muted-foreground/70 hover:text-success hover:bg-success/10 rounded-lg transition"
                  title="Copiar URL do XML"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <a
                  href={rssApi.xmlUrl(feed.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-muted-foreground/70 hover:text-orange-400 hover:bg-orange-400/10 rounded-lg transition"
                  title="Abrir XML"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => {
                    if (confirm("Remover este feed RSS?")) deleteMutation.mutate(feed.id);
                  }}
                  className="p-2 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── RSS Builder ────────────────────────────────────────────────────────────
function RSSBuilder({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState("");
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageHtml, setPageHtml] = useState("");
  const [activeField, setActiveField] = useState<SelectorField>("container");
  const [selectors, setSelectors] = useState<Selectors>({ container: "", link: "" });
  const [feedName, setFeedName] = useState("");
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matchCount, setMatchCount] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Carregar página via proxy
  const loadPage = async () => {
    if (!url.trim()) return;
    setLoadingPage(true);
    try {
      const { data } = await rssApi.proxy(url.trim());
      // Remover TODOS os <script> do HTML para impedir que o JS do site
      // (jQuery, analytics, etc.) capture cliques e cause navegação
      const cleanHtml = data
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<script[^>]*\/>/gi, "");
      setPageHtml(cleanHtml);
      setStep(2);
      // Sugerir nome do feed
      const match = url.match(/\/\/(?:www\.)?([^/]+)/);
      if (match && !feedName) setFeedName(match[1]);
    } catch {
      toast.error("Erro ao carregar pagina. Verifique a URL.");
    } finally {
      setLoadingPage(false);
    }
  };

  // Injetar script de seleção no iframe
  useEffect(() => {
    if (!pageHtml || step !== 2) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Injetar script de seleção visual
      const script = doc.createElement("script");
      script.textContent = `
        (function() {
          var overlay = null;
          var selectedOverlays = [];
          var activeField = "${activeField}";

          // ── Bloquear TODA navegação ──────────────────────────────
          // Remover href de todos os links (salvar em data-href para o scraper)
          var allLinks = document.querySelectorAll("a[href]");
          allLinks.forEach(function(a) {
            a.setAttribute("data-href", a.getAttribute("href"));
            a.removeAttribute("href");
          });

          // Bloquear forms
          document.querySelectorAll("form").forEach(function(f) {
            f.setAttribute("data-action", f.action || "");
            f.removeAttribute("action");
            f.onsubmit = function(e) { e.preventDefault(); return false; };
          });

          // Interceptar window.open, location changes
          window.open = function() { return null; };
          try {
            Object.defineProperty(window, "location", {
              configurable: false,
              get: function() { return document.location; }
            });
          } catch(ex) {}

          // Bloquear cliques na fase mais alta (capture) em TODO o documento
          document.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
          }, true);

          // Também na window
          window.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
          }, true);

          // Bloquear mousedown/mouseup para evitar drag behaviors
          document.addEventListener("mousedown", function(e) {
            e.stopPropagation();
            e.stopImmediatePropagation();
          }, true);

          document.addEventListener("submit", function(e) {
            e.preventDefault();
            e.stopPropagation();
          }, true);

          // ── Mensagens do parent ──────────────────────────────────
          window.addEventListener("message", function(e) {
            if (e.data && e.data.type === "SET_ACTIVE_FIELD") {
              activeField = e.data.field;
            }
            if (e.data && e.data.type === "HIGHLIGHT_SELECTOR") {
              clearHighlights();
              try {
                var els = document.querySelectorAll(e.data.selector);
                els.forEach(function(el) {
                  var rect = el.getBoundingClientRect();
                  var div = document.createElement("div");
                  div.className = "__sf_highlight__";
                  div.style.cssText = "position:fixed;z-index:99998;pointer-events:none;border:2px solid #22c55e;background:rgba(34,197,94,0.1);border-radius:4px;" +
                    "left:" + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;";
                  document.body.appendChild(div);
                  selectedOverlays.push(div);
                });
              } catch(ex) {}
            }
          });

          function clearHighlights() {
            selectedOverlays.forEach(function(d) { d.remove(); });
            selectedOverlays = [];
          }

          function generateSelector(el) {
            var path = [];
            var current = el;
            while (current && current !== document.body && current !== document.documentElement) {
              var tag = current.tagName.toLowerCase();
              var selector = tag;

              // Tentar classes significativas (ignorar classes dinâmicas/utilitarias)
              var classes = Array.from(current.classList || [])
                .filter(function(c) { return c.length > 1 && c.length < 50 && !/^[0-9]/.test(c) && !/^js-/.test(c); })
                .slice(0, 3);
              if (classes.length > 0) {
                selector = tag + "." + classes.join(".");
              }

              // Verificar se e unico neste nivel
              var parent = current.parentElement;
              if (parent) {
                var siblings = parent.querySelectorAll(":scope > " + selector);
                if (siblings.length > 1) {
                  var idx = Array.from(parent.children).indexOf(current) + 1;
                  selector += ":nth-child(" + idx + ")";
                }
              }

              path.unshift(selector);
              current = current.parentElement;

              // Limitar profundidade
              if (path.length >= 5) break;
            }
            return path.join(" > ");
          }

          function generalizeSelector(selector) {
            // Remove nth-child para encontrar elementos similares
            return selector.replace(/:nth-child\\(\\d+\\)/g, "");
          }

          // ── Hover highlight ──────────────────────────────────────
          document.addEventListener("mouseover", function(e) {
            if (e.target.className === "__sf_highlight__") return;
            if (overlay) overlay.remove();
            var rect = e.target.getBoundingClientRect();
            overlay = document.createElement("div");
            overlay.style.cssText = "position:fixed;z-index:99999;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:4px;transition:all 0.1s ease;" +
              "left:" + rect.left + "px;top:" + rect.top + "px;width:" + rect.width + "px;height:" + rect.height + "px;";
            document.body.appendChild(overlay);
          }, true);

          document.addEventListener("mouseout", function() {
            if (overlay) { overlay.remove(); overlay = null; }
          }, true);

          // ── Seleção por click (mouseup para evitar conflito) ────
          document.addEventListener("mouseup", function(e) {
            var el = e.target;
            if (!el || el.className === "__sf_highlight__") return;

            var selector = generateSelector(el);
            var generalized = generalizeSelector(selector);

            // Para o container, usar o seletor generalizado e contar matches
            var matchCount = 0;
            var isContainer = activeField === "container";
            var finalSelector = isContainer ? generalized : selector;

            try {
              matchCount = document.querySelectorAll(isContainer ? generalized : selector).length;
            } catch(ex) {}

            // Preview do conteudo
            var preview = "";
            if (el.tagName === "IMG") {
              preview = el.src || el.getAttribute("data-src") || "";
            } else {
              preview = el.textContent ? el.textContent.trim().substring(0, 100) : "";
            }

            // Enviar para o parent
            window.parent.postMessage({
              type: "ELEMENT_SELECTED",
              field: activeField,
              selector: finalSelector,
              preview: preview,
              matchCount: matchCount,
            }, "*");

            // Highlight matches
            clearHighlights();
            try {
              var els = document.querySelectorAll(finalSelector);
              els.forEach(function(matchEl) {
                var rect2 = matchEl.getBoundingClientRect();
                var div = document.createElement("div");
                div.className = "__sf_highlight__";
                div.style.cssText = "position:fixed;z-index:99998;pointer-events:none;border:2px solid #22c55e;background:rgba(34,197,94,0.1);border-radius:4px;" +
                  "left:" + rect2.left + "px;top:" + rect2.top + "px;width:" + rect2.width + "px;height:" + rect2.height + "px;";
                document.body.appendChild(div);
                selectedOverlays.push(div);
              });
            } catch(ex) {}
          }, true);
        })();
      `;
      doc.body.appendChild(script);

      // Adicionar estilo para modo seleção
      const style = doc.createElement("style");
      style.textContent = `
        * { cursor: crosshair !important; user-select: none !important; }
        a, button, input, select, textarea { pointer-events: auto !important; cursor: crosshair !important; }
        .__sf_highlight__ { pointer-events: none !important; }
      `;
      doc.head.appendChild(style);
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [pageHtml, step, activeField]);

  // Ouvir mensagens do iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "ELEMENT_SELECTED") {
        const { field, selector, matchCount: mc } = e.data as {
          field: SelectorField;
          selector: string;
          matchCount: number;
        };
        setSelectors((prev) => ({ ...prev, [field]: selector }));
        if (field === "container") setMatchCount(mc);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Atualizar campo ativo no iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "SET_ACTIVE_FIELD", field: activeField }, "*");
    }
  }, [activeField]);

  // Preview dos itens
  const loadPreview = async () => {
    if (!selectors.container || !selectors.link) {
      toast.error("Selecione pelo menos o container e o link");
      return;
    }
    setPreviewLoading(true);
    try {
      const { data } = await rssApi.preview({
        name: feedName || "Preview",
        source_url: url,
        selectors,
        refresh_interval: refreshInterval,
        is_active: true,
      });
      setPreviewItems(data.items as PreviewItem[]);
      toast.success(`${data.total} itens encontrados`);
    } catch {
      toast.error("Erro ao gerar preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Salvar feed
  const saveFeed = async () => {
    if (!feedName.trim()) {
      toast.error("Informe o nome do feed");
      return;
    }
    if (!selectors.container || !selectors.link) {
      toast.error("Container e Link sao obrigatorios");
      return;
    }
    setSaving(true);
    try {
      await rssApi.create({
        name: feedName.trim(),
        source_url: url,
        selectors,
        refresh_interval: refreshInterval,
        is_active: true,
      });
      toast.success("Feed RSS criado com sucesso!");
      onCreated();
    } catch {
      toast.error("Erro ao criar feed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-[calc(100vh-0px)] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-lg transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Rss className="w-5 h-5 text-orange-400" />
        <h2 className="font-semibold text-foreground">RSS Builder</h2>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 ml-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                step === s
                  ? "bg-primary/10 text-primary"
                  : step > s
                  ? "bg-success/10 text-success"
                  : "bg-muted text-muted-foreground/70"
              }`}
            >
              {step > s ? <CheckCircle2 className="w-3 h-3" /> : null}
              {s === 1 ? "URL" : s === 2 ? "Seletores" : "Configurar"}
            </div>
          ))}
        </div>

        <div className="flex-1" />

        {step === 2 && (
          <div className="flex items-center gap-2">
            <button
              onClick={loadPreview}
              disabled={previewLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-muted text-foreground rounded-lg hover:bg-muted/80 transition disabled:opacity-50"
            >
              {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              Preview
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectors.container || !selectors.link}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
            >
              Proximo
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(2)}
              className="px-3 py-1.5 text-sm bg-muted text-foreground rounded-lg hover:bg-muted/80 transition"
            >
              Voltar
            </button>
            <button
              onClick={saveFeed}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Criar Feed
            </button>
          </div>
        )}
      </div>

      {/* Step 1: URL */}
      {step === 1 && (
        <div className="flex-1 flex items-center justify-center bg-muted">
          <div className="w-full max-w-xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Globe className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Qual site deseja monitorar?</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Cole a URL da pagina que contem as noticias ou conteudo que deseja transformar em feed RSS
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadPage()}
                placeholder="https://exemplo.com/noticias"
                className="flex-1 px-4 py-3 border border-border rounded-xl text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                onClick={loadPage}
                disabled={loadingPage || !url.trim()}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition disabled:opacity-50"
              >
                {loadingPage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
                Carregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Visual Selector */}
      {step === 2 && (
        <div className="flex-1 flex min-h-0">
          {/* iframe com o site */}
          <div className="flex-1 bg-card border-r border-border min-h-0">
            <iframe
              ref={iframeRef}
              srcDoc={pageHtml}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts"
              title="RSS Builder - Preview do site"
            />
          </div>

          {/* Painel lateral direito */}
          <div className="w-80 flex-shrink-0 bg-muted flex flex-col min-h-0 overflow-y-auto">
            {/* Campos de seleção */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <MousePointer className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Selecione os elementos</h3>
              </div>
              <p className="text-xs text-muted-foreground/70 mb-3">
                Clique em um campo abaixo, depois clique no elemento correspondente na pagina
              </p>

              {(Object.keys(FIELD_LABELS) as SelectorField[]).map((field) => {
                const { label, required, hint } = FIELD_LABELS[field];
                const isActive = activeField === field;
                const hasValue = !!selectors[field];

                return (
                  <button
                    key={field}
                    onClick={() => setActiveField(field)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      isActive
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : hasValue
                        ? "border-green-300 bg-success/10"
                        : "border-border bg-card hover:border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isActive ? "text-primary" : hasValue ? "text-success" : "text-foreground"}`}>
                        {label}
                        {required && <span className="text-destructive ml-0.5">*</span>}
                      </span>
                      {hasValue && <CheckCircle2 className="w-3.5 h-3.5 text-success ml-auto" />}
                      {isActive && !hasValue && <MousePointer className="w-3.5 h-3.5 text-primary ml-auto animate-pulse" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>
                    {hasValue && (
                      <div className="mt-1.5 flex items-center gap-1">
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px] block">
                          {selectors[field]}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectors((prev) => ({ ...prev, [field]: field === "container" || field === "link" ? "" : undefined }));
                          }}
                          className="p-0.5 text-muted-foreground/70 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </button>
                );
              })}

              {matchCount > 0 && selectors.container && (
                <div className="mt-2 p-2 bg-success/10 border border-green-200 rounded-lg text-xs text-success text-center">
                  {matchCount} containers encontrados
                </div>
              )}
            </div>

            {/* Preview dos itens */}
            {previewItems.length > 0 && (
              <div className="border-t border-border p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  Preview ({previewItems.length} itens)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {previewItems.slice(0, 10).map((item, i) => (
                    <div key={i} className="p-2 bg-card border border-border rounded-lg text-xs">
                      {item.image_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-full h-20 object-cover rounded mb-1.5"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      {item.title && (
                        <p className="font-medium text-foreground line-clamp-2">{item.title}</p>
                      )}
                      {item.description && (
                        <p className="text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                      )}
                      {item.link && (
                        <p className="text-primary truncate mt-0.5">{item.link}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Configuração */}
      {step === 3 && (
        <div className="flex-1 flex items-center justify-center bg-muted">
          <div className="w-full max-w-lg p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Configurar Feed</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Defina o nome e o intervalo de atualizacao do feed
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Nome do Feed
                </label>
                <input
                  type="text"
                  value={feedName}
                  onChange={(e) => setFeedName(e.target.value)}
                  placeholder="Ex: Noticias SENAI SP"
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Intervalo de Atualizacao
                </label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {REFRESH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-card border border-border rounded-xl">
                <h4 className="text-sm font-medium text-foreground mb-2">Resumo</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium">URL:</span> {url}</p>
                  <p><span className="font-medium">Container:</span> <code className="bg-muted px-1 rounded">{selectors.container}</code></p>
                  <p><span className="font-medium">Link:</span> <code className="bg-muted px-1 rounded">{selectors.link}</code></p>
                  {selectors.title && <p><span className="font-medium">Titulo:</span> <code className="bg-muted px-1 rounded">{selectors.title}</code></p>}
                  {selectors.description && <p><span className="font-medium">Descricao:</span> <code className="bg-muted px-1 rounded">{selectors.description}</code></p>}
                  {selectors.image && <p><span className="font-medium">Imagem:</span> <code className="bg-muted px-1 rounded">{selectors.image}</code></p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
