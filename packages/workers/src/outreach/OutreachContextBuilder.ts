import type { Lead, LeadScore, PortfolioPiece, TriggerEvent, UserProfile } from '@leadflow/types';

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
  boomerang_context: BoomerangCtx | null;
  trigger_event_context: TriggerEventCtx | null;
}

export interface PortfolioMatch {
  title: string;
  url: string | null;
  similarity: number;
  key_outcome: string | null;
}

export interface BoomerangCtx {
  contacted_at: string;
  outcome: 'won' | 'lost' | 'no_reply';
  ai_summary: string;
  similarity: number;
}

export interface TriggerEventCtx {
  type: string;
  summary: string;
  event_data: Record<string, unknown>;
}

// ─── Exported helpers used by generators ─────────────────────────────────────

export function getTimeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 14) return `${days} days`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks} weeks`;
  const months = Math.floor(days / 30);
  return `${months} months`;
}

export function buildTriggerAngle(ctx: TriggerEventCtx): string {
  switch (ctx.type) {
    case 'FUNDING_ROUND':
      return `Congrats on ${ctx.summary} — teams at this stage typically need to move fast on technical execution`;
    case 'PRODUCTHUNT_LAUNCH':
      return `Saw you ${ctx.summary} — post-launch is the critical window to iterate and scale quickly`;
    case 'GITHUB_MILESTONE':
      return `${ctx.summary.charAt(0).toUpperCase() + ctx.summary.slice(1)} — fast-growing repos usually hit infrastructure challenges at this scale`;
    case 'BLOG_HIRING_SIGNAL':
      return `Noticed you ${ctx.summary} — I'd love to help fill that gap`;
    default:
      return ctx.summary;
  }
}

// ─── Private module helpers ───────────────────────────────────────────────────

function buildTriggerSummary(event: TriggerEvent): string {
  const d = event.event_data as Record<string, unknown>;
  switch (event.type) {
    case 'FUNDING_ROUND': {
      const amount = d['amount'] ? `$${formatAmount(Number(d['amount']))} ` : '';
      return `just raised ${amount}${String(d['round_type'] ?? 'a funding round')}`;
    }
    case 'PRODUCTHUNT_LAUNCH':
      return `launched ${String(d['product_name'] ?? 'a new product')} on Product Hunt${d['upvotes'] ? ` with ${d['upvotes']} upvotes` : ''}`;
    case 'GITHUB_MILESTONE':
      return `hit ${d['milestone'] ? formatNumber(Number(d['milestone'])) : String(d['star_count'] ?? 'many')} GitHub stars on ${String(d['repo_name'] ?? 'their repo')}`;
    case 'BLOG_HIRING_SIGNAL':
      return `published "${String(d['post_title'] ?? 'a new post')}" with a hiring signal`;
    default:
      return 'had a notable trigger event';
  }
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return n.toString();
}

function formatNumber(n: number): string {
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return n.toString();
}

export class OutreachContextBuilder {
  build(
    lead: Lead,
    profile: UserProfile,
    portfolioPieces: PortfolioPiece[],
    score: LeadScore | null,
  ): OutreachContext {
    // Prefer pre-computed portfolio_matches from scoring pipeline;
    // fall back to skill-overlap matching if pieces are provided.
    const portfolioMatches: PortfolioMatch[] = (lead.portfolio_matches?.length ?? 0) > 0
      ? (lead.portfolio_matches as PortfolioMatch[])
      : this.matchPortfolio(lead, portfolioPieces);

    return {
      lead: {
        title: lead.title,
        description: lead.description.slice(0, 800), // truncate for LLM context
        url: lead.url,
        source: lead.source,
        skills_required: lead.skills_required,
        budget: this.formatBudget(lead),
        remote: lead.remote,
        location: lead.location,
        client_name: lead.client_name,
        contact_email: lead.contact_email,
      },
      freelancer: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        core_skills: profile.core_skills,
        experience_years: profile.experience_years,
        hourly_rate: this.formatRate(profile),
        timezone: profile.timezone,
      },
      score: score
        ? {
          ai_score: score.ai_score,
          ai_summary: score.ai_summary,
          skill_gaps: score.skill_gaps,
        }
        : null,
      portfolio: portfolioMatches,
      boomerang_context: lead.boomerang_context
        ? {
          contacted_at: lead.boomerang_context.contacted_at,
          outcome: lead.boomerang_context.outcome,
          ai_summary: lead.boomerang_context.ai_summary,
          similarity: lead.boomerang_context.similarity,
        }
        : null,
      trigger_event_context: lead.trigger_event
        ? {
          type: lead.trigger_event.type,
          summary: buildTriggerSummary(lead.trigger_event),
          event_data: lead.trigger_event.event_data,
        }
        : null,
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
        title: piece.title,
        url: piece.url,
        similarity: Math.round(similarity * 100) / 100,
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
    if (profile.min_budget) return `min $${profile.min_budget}`;
    return 'flexible';
  }
}
