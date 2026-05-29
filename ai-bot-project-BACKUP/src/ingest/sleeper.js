import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.sleeper.app/v1',
  timeout: 20000
});

export async function getState() {
  const { data } = await api.get('/state/nfl');
  return data;
}
export async function getLeague(leagueId) {
  const { data } = await api.get(`/league/${leagueId}`);
  return data;
}
export async function getUsers(leagueId) {
  const { data } = await api.get(`/league/${leagueId}/users`);
  return data || [];
}
export async function getRosters(leagueId) {
  const { data } = await api.get(`/league/${leagueId}/rosters`);
  return data || [];
}
export async function getMatchups(leagueId, week) {
  const { data } = await api.get(`/league/${leagueId}/matchups/${week}`);
  return data || [];
}
export async function getTransactions(leagueId, week) {
  const { data } = await api.get(`/league/${leagueId}/transactions/${week}`);
  return data || [];
}
