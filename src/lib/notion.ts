import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { property } from "astro:schema";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import markedKatex from "marked-katex-extension";

marked.use(
    markedHighlight({
        emptyLangClass: "hljs",
        langPrefix: "hljs language-",
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : "plaintext";
            return hljs.highlight(code, { language }).value;
        },
    })
);

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const notion = new Client({
    auth: import.meta.env.NOTION_TOKEN,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

n2m.setCustomTransformer("image", async (block: any) => {
    const image = block.image;
    const url = image?.file?.url ?? image?.external?.url ?? "";
    const captionRichText = image?.caption ?? [];
    const caption = captionRichText.map((t: any) => t.plain_text).join("");

    if (caption) {
        return `<figure>\n<img src="${url}" alt="${caption}">\n<figcaption>${caption}</figcaption>\n</figure>`;
    }
    return `![](${url})`;
});

function preprocessMarkdown(md: string): string {
    // Fix display math with surrounding spaces: "$$ formula $$" -> "$$formula$$"
    let result = md.replace(/\$\$\s+([\s\S]+?)\s+\$\$/g, (_, inner) => `$$${inner.trim()}$$`);
    // Fix inline math with surrounding spaces: "$ formula $" -> "$formula$"
    result = result.replace(/(?<!\$)\$\s+([^$\n]+?)\s+\$(?!\$)/g, (_, inner) => `$${inner}$`);
    return result;
}

export async function getPostContent(pageId: string) {
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const { parent } = n2m.toMarkdownString(mdBlocks);
    return marked(preprocessMarkdown(parent));
}

export async function getPosts() {
    const response = await notion.databases.query({
        database_id: import.meta.env.NOTION_DATABASE_ID,
        filter: {
            property: "Status",
            status: { equals: "Published" },
        },
        sorts: [
            { property: "Date", direction: "descending" },
        ],
    });

    // const pages = response.results as PageObjectResponse[];

    return response.results;
}

export async function getPageThumbnail(pageId: string): Promise<string | null> {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 50 });
    for (const block of response.results as any[]) {
        if (block.type === "image") {
            return block.image?.file?.url ?? block.image?.external?.url ?? null;
        }
    }
    return null;
}

export function parsePost(page: any) {
    const props = page.properties;

    return {
        id: page.id,
        // Title
        title: props.Title?.title[0]?.plain_text ?? "Untitled",
        // Slug
        slug: props.Slug?.rich_text[0]?.plain_text ?? page.id,
        // Description
        description: props.Description?.rich_text[0]?.plain_text ?? "",
        // Date
        date: props.Date?.date?.start ?? null,
        // Tags
        tags: props.Tags?.select?.name ? [props.Tags.select.name] : [],

        // Files 타입 (커버 이미지)
        cover: page.cover?.external?.url ?? page.cover?.file?.url ?? null,

    };
}