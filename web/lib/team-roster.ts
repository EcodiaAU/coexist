/**
 * Full Co-Exist team roster, mirroring the live coexistaus.org/about page
 * (Board / Team / Pioneers). Charlie Bennett omitted (departed). Titles are
 * sourced from the app (role + the collective each person leads); photos resolve
 * via teamPhoto(name) against the headshots in /images/team.
 */
export interface RosterMember {
  name: string
  role?: string
}
export interface RosterGroup {
  label: string
  members: RosterMember[]
}

export const TEAM_ROSTER: RosterGroup[] = [
  {
    label: 'Board',
    members: [
      { name: 'Eliot Sanger', role: 'Chair' },
      { name: 'Nerida Bradley', role: 'Secretary' },
      { name: 'James Hattam', role: 'Board Member' },
    ],
  },
  {
    label: 'Team',
    members: [
      { name: 'Kurt Jones', role: 'Founder & CEO' },
      { name: 'Jessica Ditchfield', role: 'Community Manager' },
      { name: 'Lauren Railey', role: 'Marketing' },
      { name: 'Riley Doyle', role: 'Campouts Lead, SEQ' },
      { name: 'Brandon Marlow', role: 'Adelaide Collective Leader' },
      { name: 'Hannah Lyttle', role: 'Brisbane Collective Leader' },
      { name: 'Ben Bloom', role: 'Sunshine Coast Collective Leader' },
      { name: 'Caitlyn Di Pasquale', role: 'Melbourne City Collective Leader' },
      { name: 'Alanah Forbes', role: 'Geelong Collective Leader' },
      { name: 'Jorgie Rainbird', role: 'Mornington Peninsula Collective Leader' },
      { name: 'Nicola Tsiolis', role: 'North East Victoria Collective Leader' },
      { name: 'Sophie Nelson', role: 'Cairns Collective Leader' },
      { name: 'Keely De Klerk', role: 'Collective Leader' },
      { name: 'Maya Norris', role: 'Collective Leader' },
      { name: 'Fei Castillo', role: 'Collective Leader' },
      { name: 'Pia Finn', role: 'Collective Leader' },
      { name: 'Winnie Liang', role: 'Collective Leader' },
      { name: 'Lydia Sheehan', role: 'Collective Leader' },
      { name: 'Juliane Mateo', role: 'Collective Leader' },
      { name: 'Charlotte Kenning', role: 'Co-Leader' },
      { name: 'Gabriel Corbidge', role: 'Co-Leader' },
      { name: 'Yee Zhao', role: 'Co-Leader' },
      { name: 'Ryan Eadie', role: 'Co-Leader' },
      { name: 'Benjamin Monga', role: 'Assistant Leader' },
      { name: 'Sarah St George', role: 'Assistant Leader' },
      { name: 'Emily Oulton', role: 'Assistant Leader' },
      { name: 'Billy Radalj', role: 'Assistant Leader' },
      { name: 'Shizuku Yamagishi', role: 'Assistant Leader' },
      { name: 'Ben Hobbs-Gordon', role: 'Assistant Leader' },
      { name: 'Andrea Da Cunha', role: 'Assistant Leader' },
      { name: 'Devona Sabu', role: 'Assistant Leader' },
      { name: 'Emilie Corkeron', role: 'Assistant Leader' },
      { name: 'Star Bright', role: 'Assistant Leader' },
      { name: 'Madisen Coelho', role: 'Assistant Leader' },
    ],
  },
  {
    label: 'Pioneers',
    members: [
      { name: 'Genevieve Deaconos', role: 'Pioneer' },
      { name: 'David Mackenzie', role: 'Pioneer' },
      { name: 'Linda Barnes', role: 'Pioneer' },
      { name: 'Matt Pascoe', role: 'Pioneer' },
    ],
  },
]
