import { LiveFlagStatus, LiveRaceControlMessage } from './live.types';

export interface LiveSimulatorFixtureEvent {
  tick: number;
  id: string;
  category: LiveRaceControlMessage['category'];
  message: string;
  flag?: LiveFlagStatus;
  setFlag?: LiveFlagStatus;
}

export const LIVE_SIMULATOR_FIXTURE: LiveSimulatorFixtureEvent[] = [
  {
    tick: 2,
    id: 'rc-race-control-enabled',
    category: 'control',
    message: 'Race control communication online.',
  },
  {
    tick: 8,
    id: 'rc-yellow-s2',
    category: 'flag',
    message: 'Yellow flag sector 2. Reduce speed and no overtaking.',
    flag: 'yellow',
    setFlag: 'yellow',
  },
  {
    tick: 10,
    id: 'rc-green-clear',
    category: 'flag',
    message: 'Track clear. Green flag.',
    flag: 'green',
    setFlag: 'green',
  },
  {
    tick: 18,
    id: 'rc-incident-12',
    category: 'incident',
    message: 'Car 12 noted for track limits at turn 11.',
  },
  {
    tick: 28,
    id: 'rc-vsc-deployed',
    category: 'flag',
    message: 'Virtual safety car deployed.',
    flag: 'virtual_safety_car',
    setFlag: 'virtual_safety_car',
  },
  {
    tick: 32,
    id: 'rc-vsc-ending',
    category: 'flag',
    message: 'Virtual safety car ending. Prepare to race.',
    flag: 'green',
    setFlag: 'green',
  },
  {
    tick: 40,
    id: 'rc-sc-deployed',
    category: 'flag',
    message: 'Safety car deployed.',
    flag: 'safety_car',
    setFlag: 'safety_car',
  },
  {
    tick: 48,
    id: 'rc-sc-in',
    category: 'flag',
    message: 'Safety car in this lap.',
    flag: 'green',
    setFlag: 'green',
  },
  {
    tick: 56,
    id: 'rc-pit-window',
    category: 'pit',
    message: 'Pit lane is clear. Normal pit operations.',
  },
];
