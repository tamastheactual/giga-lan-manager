// Supabase (Postgres) store.
//
// Uses @supabase/supabase-js rather than a Postgres driver on purpose: it talks
// PostgREST over fetch, so this file runs on an edge runtime where opening a raw
// TCP connection is not possible. Nothing here imports a Node built-in.
//
// Requires the SERVICE ROLE key. The tables have RLS enabled with no permissive
// policy, so the anon key can read nothing -- see supabase/schema.sql.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TournamentManager } from '../tournament.js';
import {
    VersionConflictError,
    type StoredTournament,
    type TournamentStore,
    type TournamentSummary,
} from './types.js';

interface TournamentRow {
    id: string;
    name: string;
    join_code: string;
    game_type: string;
    state: string;
    is_team_based: boolean;
    player_count: number;
    created_at: string;
    started_at: string | null;
    document: any;
    version: number;
}

const SUMMARY_COLUMNS =
    'id,name,join_code,game_type,state,is_team_based,player_count,created_at,started_at';

export class SupabaseTournamentStore implements TournamentStore {
    private db: SupabaseClient;

    constructor(url: string, serviceRoleKey: string) {
        this.db = createClient(url, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }

    async init(): Promise<void> {
        // Fail fast and loudly if the schema was never applied, rather than at
        // the first tournament someone tries to create mid-LAN.
        const { error } = await this.db.from('tournaments').select('id').limit(1);
        if (error) {
            throw new Error(
                `Cannot read the tournaments table (${error.message}). ` +
                'Apply supabase/schema.sql and check SUPABASE_SERVICE_ROLE_KEY.',
            );
        }
    }

    async close(): Promise<void> {
        /* nothing to release: every call is a fetch */
    }

    private hydrate(row: TournamentRow | null): StoredTournament | null {
        if (!row) return null;
        try {
            return { tournament: TournamentManager.fromJSON(row.document), version: row.version };
        } catch (err) {
            console.error(`[supabase] unreadable tournament ${row.id}:`, (err as Error).message);
            return null;
        }
    }

    async load(id: string): Promise<StoredTournament | null> {
        const { data, error } = await this.db
            .from('tournaments').select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        return this.hydrate(data as TournamentRow | null);
    }

    async loadByJoinCode(code: string): Promise<StoredTournament | null> {
        const { data, error } = await this.db
            .from('tournaments').select('*').eq('join_code', code).maybeSingle();
        if (error) throw new Error(error.message);
        return this.hydrate(data as TournamentRow | null);
    }

    async listSummaries(): Promise<TournamentSummary[]> {
        // Reads the indexed columns only -- the lobby never pulls the documents.
        const { data, error } = await this.db
            .from('tournaments').select(SUMMARY_COLUMNS).order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []).map((r: any) => ({
            id: r.id,
            name: r.name,
            state: r.state,
            playerCount: r.player_count,
            gameType: r.game_type,
            createdAt: r.created_at,
            startedAt: r.started_at ?? undefined,
            isTeamBased: r.is_team_based,
            joinCode: r.join_code,
        }));
    }

    async insert(t: TournamentManager): Promise<void> {
        const { error } = await this.db.from('tournaments').insert({
            id: t.id,
            name: t.name,
            join_code: t.joinCode,
            admin_key_hash: t.adminKeyHash,
            game_type: t.gameType,
            state: t.state,
            is_team_based: t.isTeamBased,
            player_count: t.players.length,
            created_at: t.createdAt,
            started_at: t.startedAt ?? null,
            document: JSON.parse(JSON.stringify(t)),
            version: 1,
        });
        if (error) throw new Error(error.message);

        const { error: codeError } = await this.db
            .from('retired_join_codes').insert({ code: t.joinCode });
        // 23505 = unique violation: already retired, which is fine.
        if (codeError && codeError.code !== '23505') throw new Error(codeError.message);
    }

    async update(t: TournamentManager, expectedVersion: number): Promise<number> {
        // One statement asserts the version and writes, so the check cannot be
        // interleaved by a concurrent writer.
        const { data, error } = await this.db.rpc('update_tournament', {
            p_id: t.id,
            p_expected: expectedVersion,
            p_name: t.name,
            p_state: t.state,
            p_is_team_based: t.isTeamBased,
            p_player_count: t.players.length,
            p_started_at: t.startedAt ?? null,
            p_document: JSON.parse(JSON.stringify(t)),
        });
        if (error) throw new Error(error.message);
        if (data === null || data === undefined) throw new VersionConflictError(t.id);
        return Number(data);
    }

    async remove(id: string): Promise<void> {
        // The row goes; its code stays in retired_join_codes, so it is never
        // handed out again and an old bookmark 404s instead of misresolving.
        const { error } = await this.db.from('tournaments').delete().eq('id', id);
        if (error) throw new Error(error.message);
    }

    async isJoinCodeTaken(code: string): Promise<boolean> {
        const { data, error } = await this.db
            .from('retired_join_codes').select('code').eq('code', code).maybeSingle();
        if (error) throw new Error(error.message);
        return data !== null;
    }

    async isNameTaken(name: string): Promise<boolean> {
        const { data, error } = await this.db
            .from('tournaments').select('id').ilike('name', name.trim()).limit(1);
        if (error) throw new Error(error.message);
        return (data ?? []).length > 0;
    }
}
