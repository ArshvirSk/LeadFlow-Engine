import type { Lead, UserProfile, PortfolioPiece, LeadScore } from '@leadflow/types';

export interface OutreachContext {
  lead: {
    title: string;
    description: string;
    url: string;
    source: string;
    skills_required: string[];
    budget: string;
    remote: boolean;
    location: string | null;
    client_name: string | null;
    contact_email: string | null;
  };
  freelancer: {
    first_name: string;
    last_name: string;
    core_skills: string[];
    experience_years: number;
    hourly_rate: string;
    timezone: string;
  };
  score: {
    ai_score: number;
    ai_summary: string;
    skill_gaps: string[];
  } | null;
  portfolio: PortfolioMatch[];
}

export interface PortfolioMatch {
  title: string;
  url: string | null;
  similarity: number;
  key_outcome: string | null;
}

export class OutreachContextBuilder {
  build(
    lead: Lead,
    profile: UserProfile,
    portfolioPieces: PortfolioPiece[],
    score: LeadScore | null,
  ): OutreachContext {
    const portfolioMatches = this.matchPortfolio(lead, portfolioPieces);

    return {
      lead: {
        title:           lead.title,
        description:     lead.description.slice(0, 800), // truncate for LLM context
        url:             lead.url,
        source:          lead.source,
        skills_required: lead.skills_required,
        budget:          this.formatBudget(lead),
        remote:          lead.remote,
        location:        lead.location,
        client_name:     lead.client_name,
        contact_email:   lead.contact_email,
      },
      freelancer: {
        first_name:       profile.first_name,
        last_name:        profile.last_name,
        core_skills:      profile.core_skills,
        experience_years: profile.experience_years,
        hourly_rate:      this.formatRate(profile),
        timezone:         profile.timezone,
      },
      score: score
        ? {
            ai_score:   score.ai_score,
            ai_summary: score.ai_summary,
            skill_gaps: score.skill_gaps,
          }
        : null,
      portfolio: portfolioMatches,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private matchPortfolio(
    lead: Lead,
    pieces: PortfolioPiece[],
  ): PortfolioMatch[] {
    const leadSkillsLower = lead.skills_required.map(s => s.toLowerCase());

    const scored = pieces.map(piece => {
      const pieceSkillsLower = piece.skills_demonstrated.map(s => s.toLowerCase());
      const overlap = pieceSkillsLower.filter(s =>
        leadSkillsLower.some(l => l.includes(s) || s.includes(l))
      );
      const similarity = leadSkillsLower.length > 0
        ? overlap.length / Math.max(leadSkillsLower.length, pieceSkillsLower.length)
        : 0;

      return {
        title:       piece.title,
        url:         piece.url,
        similarity:  Math.round(similarity * 100) / 100,
        key_outcome: piece.outcomes ?? null,
      };
    });

    // Return top 3 most relevant pieces
    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .filter(p => p.similarity > 0);
  }

  private formatBudget(lead: Lead): string {
    if (lead.budget_min && lead.budget_max) {
      return `$${lead.budget_min}–$${lead.budget_max} (${lead.budget_type ?? 'fixed'})`;
    }
    if (lead.budget) {
      return `$${lead.budget} (${lead.budget_type ?? 'fixed'})`;
    }
    return 'not specified';
  }

  private formatRate(profile: UserProfile): string {
    if (profile.hourly_rate) return `$${profile.hourly_rate}/hr`;
    if (profile.min_budget)  return `min $${profile.min_budget}`;
    return 'flexible';
  }
}
