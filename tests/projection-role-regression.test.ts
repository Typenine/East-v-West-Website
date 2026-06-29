import { describe, expect, it } from 'vitest';
import { buildFantasyBaseline } from '@/lib/fantasy/projection-fantasy-baseline';
import { reconcileTeamOpportunityBudgets } from '@/lib/fantasy/projection-allocation';
import { buildUsageProfile } from '@/lib/fantasy/projection-usage';
import type { PlayerProjectionCandidate } from '@/lib/fantasy/projection-opportunity-types';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';

const scoring={pass_yd:.04,pass_td:5,pass_int:-2,rush_yd:.1,rush_td:6,rec:.5,rec_yd:.1,rec_td:6,fum_lost:-2};
function base(id:string,position:string,role:string,projection=6):WeeklyProjectedPlayer{return{id,name:id,position,nflTeam:'LAR',opponent:null,projection,baseline:projection,matchupFactor:1,availabilityWeight:.98,isBye:false,confidence:'medium',rangeLow:0,rangeHigh:20,expectedRole:role,workload:'',assumption:null,startProbability:role.includes('starter')?.9:.18,activeProbability:.98,statLine:{}};}
function player(id:string,position:string,depth=1):SleeperPlayer{return{player_id:id,first_name:id,last_name:'Player',position,team:'LAR',status:'Active',years_exp:2,depth_chart_order:depth}as SleeperPlayer;}
function candidate(id:string,position:'QB'|'RB'|'WR'|'TE',role:string,games:PlayerProjectionCandidate['games'],projection=6,depth=1):PlayerProjectionCandidate{const b=base(id,position,role,projection);const p=player(id,position,depth);return{id,player:p,games,base:b,projectionSeason:2026,fantasyBaseline:buildFantasyBaseline({games,position,scoring,currentTeam:'LAR'})||undefined};}
function weeks(values:Array<Record<string,number>>):PlayerProjectionCandidate['games']{return values.map((stats,index)=>({season:2025,week:index+1,stats:{team:'LAR',played:1,...stats}}));}
function run(candidates:PlayerProjectionCandidate[]){return reconcileTeamOpportunityBudgets({candidates,currentRowsByTeam:new Map(),previousRowsByTeam:new Map(),preseason:true,scoring,teamOverrides:new Map()}).players;}
const qb=()=>candidate('qb','QB','Expected starting quarterback',weeks(Array.from({length:10},()=>({pass_att:34,pass_cmp:22,pass_yd:240,pass_td:1.5,pass_int:.7,rush_att:3,rush_yd:15}))),18);

describe('role-aware workload regressions',()=>{
 it('recognizes a productive RB2 with a sustained late workload expansion',()=>{
  const corum=candidate('committee','RB','Primary backup',weeks([
   {rush_att:4,rush_yd:18},{rush_att:5,rush_yd:22},{rush_att:4,rush_yd:19},{rush_att:5,rush_yd:24},{rush_att:5,rush_yd:25},
   {rush_att:11,rush_yd:55,rush_td:.3},{rush_att:13,rush_yd:67,rush_td:.4},{rush_att:12,rush_yd:61,rush_td:.3},{rush_att:14,rush_yd:72,rush_td:.4},{rush_att:13,rush_yd:66,rush_td:.3},
  ]),7,2);
  const lead=candidate('starter','RB','Expected starter',weeks(Array.from({length:10},()=>({rush_att:16,rush_yd:72,rush_td:.4,rec_tgt:4,rec:3,rec_yd:24}))),13,1);
  const profile=buildUsageProfile(corum);const result=run([qb(),lead,corum]).find(p=>p.id==='committee')!;
  expect(profile.roleTrend).toBe('expanded');
  expect(result.expectedRole).toContain('meaningful rotation');
  expect(result.projection).toBeGreaterThan(7);
 });

 it('counts explicitly active zero-touch games instead of selecting only used weeks',()=>{
  const intermittent=candidate('intermittent','RB','Rotational role',weeks([
   {},{rush_att:3,rush_yd:12},{},{rush_att:4,rush_yd:16},{},{},{rush_att:3,rush_yd:11},{}
  ]),3,3);
  const profile=buildUsageProfile(intermittent);
  expect(profile.sampleGames).toBe(8);
  expect(profile.activeZeroGames).toBe(5);
  expect(profile.recentCarries).toBeLessThan(2);
 });

 it('does not treat one spike as a sustained role change',()=>{
  const spike=candidate('spike','RB','Committee / secondary role',weeks([
   {rush_att:6},{rush_att:6},{rush_att:7},{rush_att:6},{rush_att:7},{rush_att:6},{rush_att:6},{rush_att:22},{rush_att:6},{rush_att:7}
  ]),5,2);
  expect(buildUsageProfile(spike).roleTrend).toBe('stable');
 });

 it('preserves goal-line value and prevents camp backs from draining the rotation',()=>{
  const lead=candidate('lead','RB','Expected starter',weeks(Array.from({length:10},()=>({rush_att:15,rush_yd:65,rush_td:.35,rec_tgt:3,rec:2,rec_yd:16}))),12,1);
  const goalLine=candidate('goal','RB','Committee / secondary role',weeks(Array.from({length:10},()=>({rush_att:8,rush_yd:30,rush_td:.45,rec_tgt:1}))),7,2);
  const camp=Array.from({length:10},(_,i)=>candidate(`camp${i}`,'RB','Uncertain role',[],1,4));
  const output=run([qb(),lead,goalLine,...camp]);
  const goal=output.find(p=>p.id==='goal')!;
  const campShare=camp.reduce((sum,c)=>sum+(output.find(p=>p.id===c.id)?.carryShare||0),0);
  expect(goal.projection).toBeGreaterThan(6);
  expect(campShare).toBeLessThan(.12);
 });
});
