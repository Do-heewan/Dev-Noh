import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { property } from "astro:schema";
import { marked } from "marked";

const notion = new Client({
    auth: import.meta.env.NOTION_TOKEN,
});

const n2m = new NotionToMarkdown({ notionClient: notion });

export async function getPostContent(pageId: string) {
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const { parent } = n2m.toMarkdownString(mdBlocks);
    return marked(parent);
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