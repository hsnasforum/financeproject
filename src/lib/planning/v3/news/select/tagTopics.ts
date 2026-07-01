import { type NewsItem, type NewsTopic, type TopicTag } from "../contracts";
import { NEWS_TOPICS, tagItemTopics } from "../taxonomy";

export type TagTopicOptions = {
  topics?: NewsTopic[];
};

export function tagTopics(item: NewsItem, options: TagTopicOptions = {}): TopicTag[] {
  return tagItemTopics(item, options.topics ?? NEWS_TOPICS);
}
