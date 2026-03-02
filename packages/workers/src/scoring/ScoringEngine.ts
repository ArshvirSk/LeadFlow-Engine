import type { Lead, UserProfile, ScoreBreakdown } from '@leadflow/types';
import { getLLMProvider } from '../llm/LLMProviderFactory.js';

export interface ScoringResult {
  ai_score: number;
  score_breakdown: ScoreBreakdown;
  ai_summary: string;
  skill_gaps: string[];
  alliance_eligible: boolean;
}

export class ScoringEngine {
  async score(lead: Lead, profile: UserProfile): Promise<ScoringResult> {
    const breakdown = this.computeBreakdown(lead, profile);
    const ai_score = this.sumBreakdown(breakdown);
    const skill_gaps = this.computeSkillGaps(lead, profile);
    // Alliance eligible: good score but has a skill gap someone else could fill
    const alliance_eligible = ai_score >= 65 && skill_gaps.length > 0;
    const ai_summary = await this.generateSummary(lead, profile, breakdown, ai_score, skill_gaps);

    return { ai_score, score_breakdown: breakdown, ai_summary, skill_gaps, alliance_eligible };
  }

  // ─── Breakdown computation ─────────────────────────────────────────────────

  private computeBreakdown(lead: Lead, profile: UserProfile): ScoreBreakdown {
    return {
      skill_match:    this.scoreSkillMatch(lead, profile),    // 0-30
      budget:         this.scoreBudget(lead, profile),         // 0-20
      client_quality: this.scoreClientQuality(lead),           // 0-15
      recency:        this.scoreRecency(lead),                  // 0-15
      competition:    this.scoreCompetition(lead),              // 0-10
      contact:        this.scoreContact(lead),                  // 0-10
    };
  }

  private scoreSkillMatch(lead: Lead, profile: UserProfile): number {
    const required = lead.skills_required.map(s => s.toLowerCase());
    if (required.length === 0) return 18; // neutral when no skills listed

    const owned = [
      ...profile.core_skills,
      ...profile.preferred_skills,
    ].map(s => s.toLowerCase());

    const matched = required.filter(req =>
      owned.some(own => own.includes(req) || req.includes(own))
    );
    const ratio = matched.length / required.length;

    // 0-30 scaled by ratio
    return Math.min(30, Math.round(ratio * 30));
  }

  private scoreBudget(lead: Lead, profile: UserProfile): number {
    const budget = lead.budget ?? lead.budget_max ?? lead.budget_min;
    const minBudget = profile.min_budget ?? null;

    if (budget === null) return 10; // unknown budget — neutral

    // Below user's floor
    if (minBudget !== null && Number(budget) < Number(minBudget)) return 2;

    if (Number(budget) >= 10_000) return 20;
    if (Number(budget) >= 5_000) return 17;
    if (Number(budget) >= 2_000) return 13;
    if (Number(budget) >= 1_000) return 9;
    return 5;
  }

  private scoreClientQuality(lead: Lead): number {
    const health = lead.company_health;
    if (!health) return 8; // unknown — neutral

    if (health.status === 'green') return 15;
    if (health.status === 'yellow') return 9;
    return 2; // red
  }

  private scoreRecency(lead: Lead): number {
    const ageHours =
      (Date.now() - new Date(lead.ingested_at).getTime()) / 3_600_000;

    if (ageHours < 1)   return 15;
    if (ageHours < 6)   return 13;
    if (ageHours < 24)  return 10;
    if (ageHours < 72)  return 6;
    return 3;
  }

  private scoreCompetition(lead: Lead): number {
    const count = lead.applicant_count;
    if (count === null || count === undefined) return 6; // unknown

    if (count < 5)  return 10;
    if (count < 15) return 7;
    if (count < 30) return 4;
    return 2;
  }

  private scoreContact(lead: Lead): number {
    const hasEmail = Boolean(lead.contact_email);
    const hasLinkedIn = Boolean(lead.contact_linkedin);

    if (hasEmail && hasLinkedIn) return 10;
    if (hasEmail || hasLinkedIn) return 7;
    // Check if there's a named poster
    if (lead.poster_name)         return 5;
    return 3;
  }

  private sumBreakdown(b: ScoreBreakdown): number {
    return Math.min(100, Math.max(0,
      b.skill_match + b.budget + b.client_quality +
      b.recency + b.competition + b.contact
    ));
  }

  // ─── Skill gap detection ───────────────────────────────────────────────────

  private computeSkillGaps(lead: Lead, profile: UserProfile): string[] {
    const required = lead.skills_required.map(s => s.toLowerCase());
    const owned = [
      ...profile.core_skills,
      ...profile.preferred_skills,
    ].map(s => s.toLowerCase());

    return lead.skills_required.filter(req =>
      !owned.some(own => own.includes(req.toLowerCase()) || req.toLowerCase().includes(own))
    );
  }

  // ─── LLM summary ──────────────────────────────────────────────────────────

  private async generateSummary(
    lead: Lead,
    profile: UserProfile,
    breakdown: ScoreBreakdown,
    score: number,
    skillGaps: string[],
  ): Promise<string> {
    try {
      const llm = getLLMProvider();
      const result = await llm.complete({
        system: 'You are a concise freelance opportunity analyst. Respond in 2-3 sentences max.',
        user: `Evaluate this lead for ${profile.first_name} ${profile.last_name}.

Lead: "${lead.title}" from ${lead.source}
Budget: ${lead.budget ? `$${lead.budget}` : 'unspecified'}
Skills required: ${lead.skills_required.join(', ') || 'none listed'}
Score: ${score}/100 | Breakdown: skill_match=${breakdown.skill_match}/30 budget=${breakdown.budget}/20 quality=${breakdown.client_quality}/15 recency=${breakdown.recency}/15
Skill gaps: ${skillGaps.length ? skillGaps.join(', ') : 'none'}

Write: fit level (strong/moderate/weak), the core opportunity, and one specific pitch tip.`,
        maxTokens: 200,
        temperature: 0.3,
      });
      return result.content;
    } catch {
      // Graceful degradation — return a rule-based summary
      const level = score >= 75 ? 'strong' : score >= 50 ? 'moderate' : 'weak';
      const gapNote = skillGaps.length
        ? ` Note skill gaps: ${skillGaps.slice(0, 3).join(', ')}.`
        : '';
      return `This is a ${level} match (${score}/100).${gapNote} Focus your pitch on ${
        profile.core_skills.slice(0, 2).join(' and ') || 'your core skills'
      }.`;
    }
  }
}
