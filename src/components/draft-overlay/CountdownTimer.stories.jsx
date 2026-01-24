import React from 'react';
import CountdownTimer from './CountdownTimer';

const meta = {
  title: 'Components/CountdownTimer',
  component: CountdownTimer,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
    },
  },
  argTypes: {
    seconds: { control: 'number' },
    isRunning: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="p-4 bg-gray-900">
        <Story />
      </div>
    ),
  ],
};

export default meta;

export const Default = {
  args: {
    seconds: 120,
    isRunning: true,
  },
};

export const Paused = {
  args: {
    seconds: 45,
    isRunning: false,
  },
};

export const UnderOneMinute = {
  args: {
    seconds: 30,
    isRunning: true,
  },
};
