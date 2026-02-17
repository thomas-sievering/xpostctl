/** Twitter API v2 types */

export type TweetResponse = {
  data: {
    id: string;
    text: string;
  };
};

export type TweetCreateParams = {
  text: string;
  reply?: {
    in_reply_to_tweet_id: string;
  };
};

export type TwitterError = {
  title: string;
  detail: string;
  type: string;
  status: number;
};

export type TwitterErrorResponse = {
  errors?: TwitterError[];
  title?: string;
  detail?: string;
  status?: number;
};
