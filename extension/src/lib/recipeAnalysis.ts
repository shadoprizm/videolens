import { analyzeTimeline } from "./analyze";
import { researchRecipe, type AiAccess } from "./openai";
import type { ConcreteReportLanguage } from "./languages";
import type { RecipeContext } from "./recipe";
import type { Analysis, SourceInfo, Timeline } from "./types";

export async function analyzeRecipeWithResearch(
  access: AiAccess, timeline: Timeline, source: SourceInfo, prompt: string,
  language: ConcreteReportLanguage | "source", context: RecipeContext,
  lookup: boolean, onResearch: () => void = () => {},
): Promise<Analysis> {
  const draft = await analyzeTimeline(access, timeline, source, "recipe", prompt, language, context);
  if (!lookup || !draft.recipe) return draft;
  onResearch();
  try {
    const r = draft.recipe;
    const research = await researchRecipe(access, JSON.stringify({
      videoTitle: source.title, videoUrl: source.url, creatorDescription: context.creatorText.slice(0, 4000),
      dish: r.title, ingredients: r.ingredients, servings: r.servings, cookTime: r.cookTime,
      gaps: r.gaps, steps: r.steps,
    }).slice(0, 18_000));
    return await analyzeTimeline(access, timeline, source, "recipe", prompt, language, {
      ...context, sources: [...context.sources, ...research.sources], researchText: research.text, research: "completed",
    });
  } catch {
    // Optional enrichment must not destroy a usable video-based recipe.
    draft.recipe.research = "unavailable";
    return draft;
  }
}
