export interface LiveDriverRosterEntry {
  driverName: string;
  teamName: string;
}

export const LIVE_DRIVER_ROSTER_BY_NUMBER: Record<
  string,
  LiveDriverRosterEntry
> = {
  '1': { driverName: 'Lando Norris', teamName: 'McLaren' },
  '3': { driverName: 'Max Verstappen', teamName: 'Red Bull Racing' },
  '5': { driverName: 'Gabriel Bortoleto', teamName: 'Audi' },
  '6': { driverName: 'Isack Hadjar', teamName: 'Red Bull Racing' },
  '10': { driverName: 'Pierre Gasly', teamName: 'Alpine' },
  '11': { driverName: 'Sergio "Checo" Perez', teamName: 'Cadillac' },
  '12': { driverName: 'Andrea Kimi Antonelli', teamName: 'Mercedes' },
  '14': { driverName: 'Fernando Alonso', teamName: 'Aston Martin' },
  '16': { driverName: 'Charles Leclerc', teamName: 'Scuderia Ferrari' },
  '18': { driverName: 'Lance Stroll', teamName: 'Aston Martin' },
  '23': { driverName: 'Alexander Albon', teamName: 'Williams' },
  '27': { driverName: 'Nico Hulkenberg', teamName: 'Audi' },
  '30': { driverName: 'Liam Lawson', teamName: 'Racing Bulls (VCARB)' },
  '31': { driverName: 'Esteban Ocon', teamName: 'Haas' },
  '41': { driverName: 'Arvid Lindblad', teamName: 'Racing Bulls (VCARB)' },
  '43': { driverName: 'Franco Colapinto', teamName: 'Alpine' },
  '44': { driverName: 'Lewis Hamilton', teamName: 'Scuderia Ferrari' },
  '55': { driverName: 'Carlos Sainz', teamName: 'Williams' },
  '63': { driverName: 'George Russell', teamName: 'Mercedes' },
  '77': { driverName: 'Valtteri Bottas', teamName: 'Cadillac' },
  '81': { driverName: 'Oscar Piastri', teamName: 'McLaren' },
  '87': { driverName: 'Oliver Bearman', teamName: 'Haas' },
};
