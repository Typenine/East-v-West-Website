# Team Logos

This directory contains the team logos for the East v. West dynasty fantasy football league.

## Naming Convention

Please name the logo files according to the following convention:

1. Use the team name in lowercase
2. Replace spaces with hyphens
3. Remove any special characters (apostrophes, periods, etc.)
4. Use PNG format with transparent background

## Examples

| Team Name | Logo Filename |
|-----------|--------------|
| Belleview Badgers | `belleview-badgers.png` |
| Belltown Raptors | `belltown-raptors.png` |
| Minshew's Maniacs | `minshews-maniacs.png` |
| Double Trouble | `double-trouble.png` |
| Mt. Lebanon Cake Eaters | `mt-lebanon-cake-eaters.png` |
| The Lone Ginger | `the-lone-ginger.png` |
| bop pop | `bop-pop.png` |
| Red Pandas | `red-pandas.png` |
| BeerNeverBrokeMyHeart | `beerneverbrokeymyheart.png` |
| Elemental Heroes | `elemental-heroes.png` |
| Detroit Dawgs | `detroit-dawgs.png` |
| Bimg Bamg Boomg | `bimg-bamg-boomg.png` |

## Usage in Code

To use these logos in the application, use the following path format:

```typescript
const teamLogoPath = `/assets/teams/${teamNameFormatted}.png`;
```

You can use the utility function below to generate the correct path:

```typescript
// Utility function to get team logo path
export const getTeamLogoPath = (teamName: string): string => {
  const formattedName = teamName
    .toLowerCase()
    .replace(/[''\.]/g, '')
    .replace(/\s+/g, '-');
  
  return `/assets/teams/${formattedName}.png`;
};
```
