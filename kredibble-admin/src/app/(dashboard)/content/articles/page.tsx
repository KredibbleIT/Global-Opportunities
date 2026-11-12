"use client";

/**
 * Career resources: the articles shown in the app's Career resources section.
 * Built on the shared list template; this file holds the column config and the data.
 * Data: lib/services/articles.ts (SEC-157): the samples in mock mode, GET /admin/articles in real mode. "New article" is the primary action.
 */
import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import type { Article } from "@/lib/mock-articles";
import { loadArticleRows } from "@/lib/services/articles";
import { pluralize } from "@/lib/plural";
import { useListData } from "@/lib/use-list-data";
import { EmptyAction } from "@/components/list/EmptyAction";
import { DataTable } from "@/components/list/DataTable";
import { ListPage } from "@/components/list/ListPage";
import { TableToolbar } from "@/components/list/TableToolbar";
import type { Column } from "@/components/list/types";


const COLUMNS: Column<Article>[] = [
  {
    key: "title",
    header: "Title",
    type: "primary",
    width: "42%",
    title: (r) => r.title,
    titleLines: 2,
    // A 36px thumbnail when the article has a banner, otherwise a document tile.
    leading: (r) => ({ icon: FileText, imageSrc: r.bannerImage }),
  },
  { key: "category", header: "Category", type: "text", width: "20%", value: (r) => r.category },
  { key: "readTime", header: "Read time", type: "text", width: "16%", value: (r) => r.duration || "—" },
  { key: "status", header: "Status", type: "status", width: "22%", status: (r) => r.status },
];

type StatusFilter = "all" | "published" | "draft";

export default function ArticlesListPage() {
  const { rows, isLoading, error, retry } = useListData(loadArticleRows);
  // GOD-T41: a search (title or category) and a status filter, as on the other lists; the counts follow the search.
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const all = rows ?? [];
  const draftCount = all.filter((a) => a.status === "draft").length;
  const term = search.trim().toLowerCase();
  const searched = all.filter((a) => !term || a.title.toLowerCase().includes(term) || a.category.toLowerCase().includes(term));
  const visible = status === "all" ? searched : searched.filter((a) => a.status === status);
  const options = (["all", "published", "draft"] as const).map((value) => ({
    value,
    label: value === "all" ? "All" : value === "published" ? "Published" : "Draft",
    count: rows ? (value === "all" ? searched.length : searched.filter((a) => a.status === value).length) : undefined,
  }));

  return (
    <ListPage
      title="Career resources"
      subtitle={
        rows
          ? `Articles shown in the Career resources section of the app. ${pluralize(draftCount, "draft")} not yet published.`
          : "Articles shown in the Career resources section of the app."
      }
      action={{ label: "New article", href: "/content/articles/new", icon: Plus }}
      toolbar={
        <TableToolbar
          search={{ value: search, onChange: setSearch, placeholder: "Search by title or category", label: "Search articles" }}
          filters={{ options, value: status, onChange: setStatus, label: "Filter by status" }}
        />
      }
    >
      <DataTable
        label="Articles"
        columns={COLUMNS}
        rows={visible}
        getRowKey={(r) => r.id}
        getRowHref={(r) => `/content/articles/${r.id}`}
        loading={isLoading}
        error={error}
        onRetry={retry}
        isFiltered={status !== "all" || term !== ""}
        resetKey={`${status}|${term}`}
        emptyNoData={{ icon: FileText, title: "No articles yet", description: "Write the first Career resources article.", action: <EmptyAction href="/content/articles/new" label="Add your first article" /> }}
        emptyNoResults={{ icon: FileText, title: "No articles match", description: "Try another status or search." }}
      />
    </ListPage>
  );
}
