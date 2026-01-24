import React, { useState } from 'react';
import CountdownTimer from './CountdownTimer';

const ComponentPlayground = () => {
  const [seconds, setSeconds] = useState(30);
  const [isRunning, setIsRunning] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Component Playground</h1>
      
      <div className="space-y-8">
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">CountdownTimer</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="number"
                value={seconds}
                onChange={(e) => setSeconds(parseInt(e.target.value))}
                className="bg-gray-700 text-white px-3 py-2 rounded"
                min="0"
              />
              <button
                onClick={() => setIsRunning(!isRunning)}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
              >
                {isRunning ? 'Stop' : 'Start'}
              </button>
            </div>
            <div className="bg-gray-950 p-6 rounded-lg">
              <CountdownTimer seconds={seconds} isRunning={isRunning} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ComponentPlayground;
