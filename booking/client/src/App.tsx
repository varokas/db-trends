


import React, { useCallback, useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Map } from 'immutable';

/**
 * {id: 1, round: "CUvyrp1GKK", seat: "A0000", owner: null, counter: null, updated: null}
 */
type Seat = {
  id: number;
  round: string;
  seat: string;
  owner: string;
  clicks?: number;
};

type Owner = {
  counts: number;
  owner: string;
};

const mainConstentStyle = {
  display: 'flex',
  height: '100vw',
  width: '100vw',
  flexDirection: 'column' as const
}

const rowStyle = {
  display: 'flex',
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  marginBottom: '50px',
  width: '60vw'
}

const itemStyle = {
  display: 'inline-block',
  height: '50px',
  width: '50px',
  border: 'solid #000',
  borderWidth: '1px',
  borderColor: 'coral'
}

const leaderBoardStyle = {
  display: 'flex',
  height: '100vw',
  width: '20vw',
  position: 'fixed' as const,
  top: 0,
  right: 0,
  flexDirection: 'column' as const
}

export const App = () => {

  const [owners, setOwners] = useState<Owner[]>([]);
  const [name, setName] = useState<string>('');
  const [booking, setBooking] = useState<Seat[][]>([]);
  const [bookingMap, setBookingMap] = useState<Map<string, Seat>>(Map({}));
  const [clicksMap, setClickMap] = useState<Map<string, number>>(Map({}));

  const getBooking = useCallback(
    async () => {
      return axios.get('/api/booking')
        .then(res => {
          const seats = res.data as Seat[];

          const newBookingMap = {}
          const seatsGroups: Seat[][] = [];
          let currentRow = '';

          seats.forEach(s => {
            newBookingMap[s.seat] = s;
            if (s.seat.charAt(0) !== currentRow) {
              seatsGroups[seatsGroups.length] = [];
              currentRow = s.seat.charAt(0);
            }
            seatsGroups[seatsGroups.length - 1].push(s)
          })

          setBookingMap(Map(newBookingMap));

          return seatsGroups
        }).then(seatsGroups => setBooking(seatsGroups))
    },
    [],
  );

  useEffect(() => {
    getBooking();

    const interval = setInterval(() => {
      axios.get('/api/booking/owners')
        .then(res => {
          setOwners(res.data as Owner[]);
        }, fail => {
          console.error('fail loading leader board', fail)
        })
    }, 10000);

    return () => clearInterval(interval);
  }, [getBooking]);

  const onSeatClick = useCallback(
    (seat) => {
      const count = clicksMap.get(seat.seat);
      setClickMap(clicksMap.set(seat.seat, count ? count + 1 : 1))
    },
    [clicksMap]);


  const onSubmit = useCallback(
    () => {
      clicksMap.entrySeq().forEach(e => console.log(`key: ${e[0]}, value: ${e[1]}`));
      const allPromises = clicksMap.entrySeq().map(e => axios.post('/api/makeBooking',
        {
          ...bookingMap.get(e[0]),
          counter: e[1],
          owner: name
        },
        {
          headers: {
            'Content-Type': 'application/json',
          }
        }
      ));

      Promise.all(allPromises).then(value => {
        console.log('done submitting');
        getBooking();
      }, reason => {
        console.log('fail', reason);
        getBooking();
      })
    },
    [clicksMap, bookingMap, name]);


  return (<div style={mainConstentStyle}>
    <div style={leaderBoardStyle}>
      <h2>Owner Dashboard</h2>
      <ol>
        {
          owners.map(o => {
            return (<li key={o.owner}> {o.owner} ({o.counts})</li>)
          })
        }
      </ol>
    </div>
    <div style={rowStyle} >
      Name:
      <input type="text" value={name} onChange={e => setName(e.target.value)} />
      <button type="button" onClick={onSubmit}>Submit</button>
    </div>
    {
      booking.map((group, i) => {
        return (<div style={rowStyle} key={group[0].seat.charAt(0)}>
          {group.map((s, j) => {
            return (
              <div
                style={
                  {
                    ...itemStyle,
                    backgroundColor: !s.owner ? 'blue' : (s.owner === name) ? 'green' : 'red'
                  }
                }
                key={s.seat}
                onClick={() => onSeatClick(s)}
              >
                {clicksMap.get(s.seat) || 0}
              </div>);
          })}
        </div>)
      })
    }
  </div >);
}