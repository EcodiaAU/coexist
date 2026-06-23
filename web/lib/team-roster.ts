/**
 * Full Co-Exist team roster, mirroring the live coexistaus.org/about page
 * (Board / Team / Pioneers). Charlie Bennett omitted (departed). Photos resolve
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
      { name: 'Nerida Bradley', role: 'Secretary & Board Member' },
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
      { name: 'Brandon Marlow' },
      { name: 'Hannah Lyttle' },
      { name: 'Keely De Klerk' },
      { name: 'Sophie Nelson' },
      { name: 'Alanah Forbes' },
      { name: 'Maya Norris' },
      { name: 'Fei Castillo' },
      { name: 'Caitlyn Di Pasquale' },
      { name: 'Jorgie Rainbird' },
      { name: 'Pia Finn' },
      { name: 'Ben Bloom' },
      { name: 'Winnie Liang' },
      { name: 'Lydia Sheehan' },
      { name: 'Nicola Tsiolis' },
      { name: 'Charlotte Kenning' },
      { name: 'Benjamin Monga' },
      { name: 'Sarah St George' },
      { name: 'Emily Oulton' },
      { name: 'Juliane Mateo' },
      { name: 'Billy Radalj' },
      { name: 'Shizuku Yamagishi' },
      { name: 'Ben Hobbs-Gordon' },
      { name: 'Gabriel Corbidge' },
      { name: 'Yee Zhao' },
      { name: 'Andrea Da Cunha' },
      { name: 'Devona Sabu' },
      { name: 'Emilie Corkeron' },
      { name: 'Star Bright' },
      { name: 'Madisen Coelho' },
      { name: 'Ryan Eadie' },
    ],
  },
  {
    label: 'Pioneers',
    members: [
      { name: 'Genevieve Deaconos' },
      { name: 'David Mackenzie' },
      { name: 'Linda Barnes' },
      { name: 'Matt Pascoe' },
    ],
  },
]
