import type { ScrapedVideo } from "@/lib/apify-youtube";
import { fetchChannelPublicVideos } from "@/lib/channel-videos";

/** Collect public landscape videos directly from channel URL/handle inputs. */
export async function searchReferenceChannels(
  _topic: string,
  channelsRaw: string
): Promise<ScrapedVideo[]> {
  return fetchChannelPublicVideos(channelsRaw, { limit: 12 });
}
