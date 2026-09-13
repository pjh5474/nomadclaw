export type Status = "idle" | "writing" | "done";

export type NovelState = {
  premise: string;
  status: Status;
  totalChapters: number;
  currentChapter: number;
  chapters: string[];
};
