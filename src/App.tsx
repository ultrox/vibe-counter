import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Settings,
  Save,
  Volume2,
  VolumeX,
} from 'lucide-react';

function getStatus(wakeLock: WakeLockSentinel | null) {
  if (!wakeLock) return 'released';
  return wakeLock.released ? 'released' : 'active';
}

function useWakeLock() {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  const release = () => {
    if (!wakeLock) {
      return;
    }

    wakeLock.onrelease = () => {
      setWakeLock(null);
    };

    wakeLock.release().then(() => {
      setWakeLock(null);
    });
  };

  const requestLock = async () => {
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.onrelease = () => {
        setWakeLock(null);
      };
      setWakeLock(lock);
    } catch (err) {
      // error
      // no permissions (we run in iframe)
      // browser not supporting
    }
  };

  useEffect(() => {
    (async () => {
      await requestLock();
    })();

    return () => release();
  }, []);

  console.log(wakeLock);
  return {
    status: getStatus(wakeLock),
    release,
    lock: requestLock,
  };
}

export default function IntervalTimer() {
  // Timer settings
  const [workTime, setWorkTime] = useState(30);
  const [pauseTime, setPauseTime] = useState(15);
  const [delayStartTime, setDelayStartTime] = useState(5);
  const [warningTime, setWarningTime] = useState(3);
  const [cycles, setCycles] = useState(3);

  // Timer state
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('idle'); // idle, delayStart, work, pause, complete
  const [currentTime, setCurrentTime] = useState(0);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isMuted, setIsMuted] = useState(false);


  // Audio context for sounds
  const audioContextRef = useRef<AudioContext | null>(null);

  // Wake lock to prevent screen from turning off
  const wakeLock = useWakeLock();
console.log(wakeLock)
  // Initialize audio context
  useEffect(() => {
    // Create audio context only when needed (on first render)
    audioContextRef.current = new window.AudioContext();

    // Clean up on unmount
    return () => {
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Play beep sound
  const playBeep = (duration = 0.1, frequency = 800, type: OscillatorType = 'sine') => {
    if (isMuted || !audioContextRef.current) return;

    try {
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gainNode.gain.value = 0.5;

      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      oscillator.start();

      // Schedule the sound to stop
      oscillator.stop(audioContextRef.current.currentTime + duration);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  // Play double beep sound
  const playDoubleBeep = () => {
    if (isMuted) return;
    playBeep(0.1, 880);
    setTimeout(() => playBeep(0.1, 880), 150);
  };

  // Start the timer when isRunning changes to true
  useEffect(() => {
    if (isRunning && currentPhase === 'idle') {
      if (delayStartTime > 0) {
        setCurrentPhase('delayStart');
        setCurrentTime(delayStartTime);
      } else {
        setCurrentPhase('work');
        setCurrentTime(workTime);
        playBeep(0.1, 800);
      }
      // Request wake lock when timer starts
      wakeLock.lock();
    }
  }, [isRunning, currentPhase, delayStartTime, workTime, wakeLock]);

  // Handle phase transitions when time reaches zero
  useEffect(() => {
    if (!isRunning || currentTime > 0) return;

    if (currentPhase === 'delayStart') {
      setCurrentPhase('work');
      setCurrentTime(workTime);
      playBeep(0.1, 800);
    } else if (currentPhase === 'work') {
      setCurrentPhase('pause');
      setCurrentTime(pauseTime);
      playBeep(0.1, 800);
    } else if (currentPhase === 'pause') {
      if (currentCycle < cycles) {
        setCurrentCycle((prev) => prev + 1);
        if (delayStartTime > 0) {
          setCurrentPhase('delayStart');
          setCurrentTime(delayStartTime);
        } else {
          setCurrentPhase('work');
          setCurrentTime(workTime);
          playBeep(0.1, 800);
        }
      } else {
        setCurrentPhase('complete');
        playDoubleBeep();
        // Release wake lock when workout is complete
        wakeLock.release();
      }
    }
  }, [
    currentTime,
    isRunning,
    currentPhase,
    workTime,
    pauseTime,
    delayStartTime,
    currentCycle,
    cycles,
    isMuted,
    wakeLock,
  ]);

  // Release wake lock when timer is paused
  useEffect(() => {
    if (!isRunning && currentPhase !== 'idle' && currentPhase !== 'complete') {
      wakeLock.release();
    }
  }, [isRunning, currentPhase, wakeLock]);

  // Timer countdown
  useEffect(() => {
    if (!isRunning || currentTime <= 0) return;

    const countdown = () => {
      setCurrentTime((prevTime) => {
        // Play warning sound before phase ends
        if (
          prevTime === warningTime &&
          (currentPhase === 'work' ||
            currentPhase === 'pause' ||
            currentPhase === 'delayStart')
        ) {
          playBeep(0.1, 700);
        }

        return prevTime - 1;
      });
    };

    const timer = setInterval(countdown, 1000);
    return () => clearInterval(timer);
  }, [isRunning, currentPhase, warningTime, isMuted]);

  // Move to next phase when current phase ends
  useEffect(() => {
    if (isRunning && currentTime === 0) {
      // This is intentionally empty as the phase transition is handled in another useEffect
    }
  }, [currentTime, isRunning]);

  // Reset the timer
  const resetTimer = () => {
    setIsRunning(false);
    setCurrentPhase('idle');
    setCurrentTime(0);
    setCurrentCycle(1);
    // Release wake lock when timer resets
    wakeLock.release();
  };

  // Toggle timer
  const toggleTimer = () => {
    if (currentPhase === 'complete') {
      resetTimer();
      setIsRunning(true);
    } else {
      const newRunningState = !isRunning;
      setIsRunning(newRunningState);

      // Request wake lock when resuming
      if (newRunningState && currentPhase !== 'idle') {
        wakeLock.lock();
      }
    }
  };

  // Toggle settings panel
  const toggleSettings = () => {
    setShowSettings((prev) => !prev);
    if (isRunning) {
      setIsRunning(false);
    }
  };

  // Save settings
  const saveSettings = () => {
    setShowSettings(false);
    resetTimer();
  };

  // Toggle audio mute
  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  // Get display time based on current state
  const getDisplayTime = () => {
    if (showSettings && currentPhase === 'idle') {
      return workTime; // Show work time in settings when idle
    }
    return currentTime;
  };

  // Format time as MM:SS
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  };

  // Get phase label
  const getPhaseLabel = () => {
    if (showSettings && currentPhase === 'idle') {
      return 'Work Preview';
    }

    switch (currentPhase) {
      case 'idle':
        return 'Ready';
      case 'delayStart':
        return 'Get Ready';
      case 'work':
        return 'Work';
      case 'pause':
        return 'Rest';
      case 'complete':
        return 'Complete';
      default:
        return 'Ready';
    }
  };

  // Get progress percentage for circular timer
  const getProgress = () => {
    if (currentPhase === 'idle' || currentPhase === 'complete') return 0;

    const displayTime = getDisplayTime();
    let totalTime = 0;

    if (currentPhase === 'delayStart') totalTime = delayStartTime;
    if (currentPhase === 'work') totalTime = workTime;
    if (currentPhase === 'pause') totalTime = pauseTime;

    // When in settings and idle, show work time progress
    if (showSettings && currentPhase === 'idle') {
      return 0; // No progress when idle in settings
    }

    return ((totalTime - displayTime) / totalTime) * 100;
  };

  // Get color based on current phase
  const getPhaseColor = () => {
    if (showSettings && currentPhase === 'idle') {
      return '#ef4444'; // Work color for preview
    }

    switch (currentPhase) {
      case 'delayStart':
        return '#f59e0b';
      case 'work':
        return '#ef4444';
      case 'pause':
        return '#3b82f6';
      case 'complete':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      {/* Main timer interface */}
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Interval Timer</h1>
          <div className="flex space-x-2">
            <button
              onClick={toggleMute}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={toggleSettings}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Timer Display */}
        {!showSettings && (
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-64 h-64">
              {/* Background circle */}
              <div className="absolute inset-0 rounded-full border-8 border-gray-200"></div>

              {/* Progress circle */}
              <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke={getPhaseColor()}
                  strokeWidth="8"
                  strokeDasharray="289.027"
                  strokeDashoffset={289.027 - (289.027 * getProgress()) / 100}
                  transform="rotate(-90 50 50)"
                />
              </svg>

              {/* Timer text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-gray-800">
                  {formatTime(getDisplayTime())}
                </div>
                <div
                  className="text-xl font-medium mt-2"
                  style={{ color: getPhaseColor() }}
                >
                  {getPhaseLabel()}
                </div>
                {(currentPhase !== 'idle' && currentPhase !== 'complete') ||
                (showSettings && currentPhase === 'idle') ? (
                  <div className="text-sm text-gray-500 mt-1">
                    {showSettings && currentPhase === 'idle'
                      ? `Will run ${cycles} cycle${cycles !== 1 ? 's' : ''}`
                      : `Cycle ${currentCycle} of ${cycles}`}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Work Time (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={workTime}
                  onChange={(e) =>
                    setWorkTime(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full p-2 border border-gray-300 rounded-md mb-2"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => setWorkTime(15)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      workTime === 15
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    15s
                  </button>
                  <button
                    onClick={() => setWorkTime(30)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      workTime === 30
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    30s
                  </button>
                  <button
                    onClick={() => setWorkTime(60)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      workTime === 60
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    60s
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pause Time (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={pauseTime}
                  onChange={(e) =>
                    setPauseTime(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full p-2 border border-gray-300 rounded-md mb-2"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPauseTime(15)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      pauseTime === 15
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    15s
                  </button>
                  <button
                    onClick={() => setPauseTime(30)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      pauseTime === 30
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    30s
                  </button>
                  <button
                    onClick={() => setPauseTime(60)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      pauseTime === 60
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    60s
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delay Start Time (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  value={delayStartTime}
                  onChange={(e) =>
                    setDelayStartTime(
                      Math.max(0, parseInt(e.target.value) || 0)
                    )
                  }
                  className="w-full p-2 border border-gray-300 rounded-md mb-2"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => setDelayStartTime(0)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      delayStartTime === 0
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    0s
                  </button>
                  <button
                    onClick={() => setDelayStartTime(5)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      delayStartTime === 5
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    5s
                  </button>
                  <button
                    onClick={() => setDelayStartTime(10)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      delayStartTime === 10
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    10s
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Warning Time (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={warningTime}
                  onChange={(e) =>
                    setWarningTime(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Cycles
                </label>
                <input
                  type="number"
                  min="1"
                  value={cycles}
                  onChange={(e) =>
                    setCycles(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full p-2 border border-gray-300 rounded-md mb-2"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCycles(3)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      cycles === 3
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    3
                  </button>
                  <button
                    onClick={() => setCycles(5)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      cycles === 5
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    5
                  </button>
                  <button
                    onClick={() => setCycles(8)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      cycles === 8
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    8
                  </button>
                  <button
                    onClick={() => setCycles(10)}
                    className={`px-3 py-1 text-sm rounded-md border ${
                      cycles === 10
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    10
                  </button>
                </div>
              </div>

              <button
                onClick={saveSettings}
                className="w-full flex items-center justify-center py-2 px-4 bg-blue-600 rounded-md text-white font-medium hover:bg-blue-700"
              >
                <Save size={18} className="mr-2" /> Save Settings
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        {!showSettings && (
          <div className="flex justify-center space-x-4">
            <button
              onClick={toggleTimer}
              className={`flex items-center justify-center py-2 px-6 rounded-md text-white font-medium ${
                isRunning
                  ? 'bg-yellow-500 hover:bg-yellow-600'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isRunning ? (
                <Pause size={18} className="mr-2" />
              ) : (
                <Play size={18} className="mr-2" />
              )}
              {isRunning
                ? 'Pause'
                : currentPhase === 'complete'
                ? 'Restart'
                : 'Start'}
            </button>

            <button
              onClick={resetTimer}
              className="flex items-center justify-center py-2 px-6 bg-gray-600 rounded-md text-white font-medium hover:bg-gray-700"
              disabled={currentPhase === 'idle'}
            >
              <RotateCcw size={18} className="mr-2" /> Reset
            </button>
          </div>
        )}

        {/* Status text */}
        {!showSettings &&
          currentPhase !== 'idle' &&
          currentPhase !== 'complete' && (
            <div className="mt-6 text-center text-sm text-gray-500">
              {currentPhase === 'delayStart' &&
                'Get ready for your work period!'}
              {currentPhase === 'work' && 'Focus on your exercise!'}
              {currentPhase === 'pause' &&
                'Take a rest. Next cycle starts soon.'}
            </div>
          )}

        {/* Complete message */}
        {currentPhase === 'complete' && (
          <div className="mt-6 text-center text-sm font-medium text-green-600">
            Workout complete! Great job!
          </div>
        )}
      </div>
    </div>
  );
}