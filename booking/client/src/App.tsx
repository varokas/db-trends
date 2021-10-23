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
  counter?: number;
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
  display: 'flex',
  height: '50px',
  width: '50px',
  border: 'solid #000',
  borderWidth: '1px',
  borderColor: 'black',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  cursor: 'pointer' as const
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

  const [loadingOwners, setLoadingOwners] = useState<boolean>(false);
  const [loadingSeats, setLoadingSeats] = useState<boolean>(false);
  const [loadingSeatsError, setLoadingSeatsError] = useState<string>(null);
  const [loadingOwnersError, setLoadingOwnersError] = useState<string>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [name, setName] = useState<string>('');
  const [booking, setBooking] = useState<Seat[][]>([]);
  const [bookingMap, setBookingMap] = useState<Map<string, Seat>>(Map({}));
  const [clicksMap, setClickMap] = useState<Map<string, number>>(Map({}));

  const getBooking = useCallback(
    async () => {
      setLoadingSeats(true);
      setLoadingSeatsError(null);
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
            seatsGroups[seatsGroups.length - 1].push(s);


          });

          setBookingMap(Map(newBookingMap));

          return seatsGroups
        }).then(seatsGroups => {
          setBooking(seatsGroups);
          setLoadingSeats(false);
        }).catch(err => setLoadingOwnersError(err));
    },
    [],
  );

  useEffect(() => {
    getBooking();

    const getData = () => {
      setLoadingOwnersError(null);
      setLoadingOwners(true);
      getBooking();
      return axios.get('/api/booking/owners')
        .then(res => {
          setOwners(res.data as Owner[]);
          setLoadingOwners(false);
        }, fail => {
          console.error('fail loading leader board', fail)
          setLoadingOwnersError(fail);
        });
    };

    getData();
    const interval = setInterval(getData, 5000);

    return () => clearInterval(interval);
  }, [getBooking]);

  const onSeatClick = useCallback(
    (seat) => {
      const count = clicksMap.get(seat.seat);
      setClickMap(clicksMap.set(seat.seat, count ? count + 1 : 1))
      onSubmit();
    },
    [clicksMap]);


  const onSubmit = useCallback(
    () => {
      if (name !== '') {
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
        });
      }
    },
    [clicksMap, bookingMap, name]);


  const getOwnerClicks = useCallback((seat: Seat) => {
    const newClicks = clicksMap.get(seat.seat) || 0;
    const savedClicks = seat.owner === name && seat.counter ? seat.counter : 0;
    return newClicks + savedClicks;
  }, [clicksMap, name]);

  return (<div style={mainConstentStyle}>
    <div style={leaderBoardStyle}>
      <h2>Owner Dashboard</h2>
      {loadingOwners
        ? "Loading..."
        : loadingOwnersError ? loadingOwnersError : (<ol>
          {
            owners.map(o => {
              return (<li key={o.owner}> {o.owner} ({o.counts})</li>)
            })
          }
        </ol>)
      }
    </div>
    <div style={rowStyle} >
      Name:
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={'your name'} />
    </div>
    {loadingSeats
      ? "Loading..."
      : loadingSeatsError ? loadingSeatsError : booking.map((group, i) => {
        return (<div style={rowStyle} key={group[0].seat.charAt(0)}>
          {group.map((s, j) => {
            return (
              <div
                style={
                  {
                    ...itemStyle,
                    backgroundColor: !s.owner ? '#79cafc' : (s.owner === name) ? '#e0fc79' : '#fc8079'
                  }
                }
                key={s.seat}
                onClick={() => onSeatClick(s)}
              >
                {getOwnerClicks(s)}
              </div>);
          })}
        </div>)
      })
    }
  </div >);
}