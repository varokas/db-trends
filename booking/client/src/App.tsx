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
  marginBottom: '5px',
  width: '60vw'
}

const colStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  flexWrap: 'wrap' as const,
  marginBottom: '5px',
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
  cursor: 'pointer' as const,
  flexDirection: 'column' as const
}

const colorExplainStyle = {
  display: 'flex',
  height: '30px',
  width: '30px',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  fontSize: '10px',
  marginRight: '5px'
}



const leaderBoardStyle = {
  display: 'flex',
  height: '100vw',
  width: '30vw',
  position: 'fixed' as const,
  top: 0,
  right: 0,
  flexDirection: 'column' as const,
}

const leaderBoardHeaderStyle = {
  display: 'flex',
  minHeight: '20px',
}

const OwnedColor = '#e0fc79';
const NotOwnedColor = '#fc8079';
const FreeColor = '#79cafc';

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
  const [isStart, setStart] = useState<boolean>(false);

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
        }).catch(err => {
          console.error('fail loading board', err);
          setLoadingSeats(false);
          setLoadingSeatsError(err.response.status + ' ' + err.response.data)
          alert('Fail loading territories: ' + err.response.status + ' ' + err.response.data);
        });
    },
    [],
  );

  useEffect(() => {
    const getData = () => {
      if (isStart) {
        setLoadingOwnersError(null);
        setLoadingOwners(true);
        getBooking();
        return axios.get('/api/booking/owners')
          .then(res => {
            setOwners(res.data as Owner[]);
            setLoadingOwners(false);
          }).catch(err => {
            console.error('fail loading leader board', err);
            setLoadingOwners(false);
            setLoadingOwnersError(err.response.status + ' ' + err.response.data);
            alert('Fail loading leader board: ' + err.response.status + ' ' + err.response.data);
          });
      }
    };

    getData();
    const interval = setInterval(getData, 5000);

    return () => clearInterval(interval);
  }, [getBooking, isStart]);

  const onSeatClick = useCallback(
    (seat) => {
      if (name && !loadingSeats) {
        const count = clicksMap.get(seat.seat);
        setClickMap(clicksMap.set(seat.seat, count ? count + 1 : 1))
      }

    },
    [clicksMap, name, loadingSeats]);


  useEffect(() => {
    onSubmit();
  }, [clicksMap]);


  const onSubmit = useCallback(
    () => {
      if (name !== '' && isStart) {
        const body = clicksMap.entrySeq().map(e =>
        ({
          ...bookingMap.get(e[0]),
          counter: e[1],
          owner: name
        }));

        axios.post('/api/makeBookings',
          body,
          {
            headers: {
              'Content-Type': 'application/json',
            }
          }
        ).then(value => {
          console.log('done submitting');
          getBooking();
        }, reason => {
          console.log('fail', reason);
          alert('Fail Submitting Scores: ' + reason);
          getBooking();
        });
      }
    },
    [clicksMap, bookingMap, name, isStart]);


  const saveName = useCallback(() => {
    if (name) {
      setStart(true);
    }
  }, [name]);


  const getOwnerClicks = useCallback((seat: Seat) => {
    const savedClicks = seat.counter ? seat.counter : 0;
    return savedClicks;
  }, [name]);

  return (<div style={mainConstentStyle}>
    <div style={leaderBoardStyle}>
      <div style={colStyle}>
        <h2 style={leaderBoardHeaderStyle}>Owner Dashboard</h2>
        <span style={leaderBoardHeaderStyle}>
          Status: {loadingOwnersError
            ? (<span style={{ color: 'red' }}>loadingOwnersError</span>)
            : loadingOwners ? "Loading..." : "Loaded"}
        </span>
      </div>

      {(<ol>
        {
          owners.map(o => {
            return (<li key={o.owner}> {o.owner} ({o.counts})</li>)
          })
        }
      </ol>)
      }
    </div>
    <div style={{ ...rowStyle, marginBottom: '20px' }} >
      <div style={colStyle} >
        {
          isStart ? (
            <span style={{ display: 'flex' }}>Name: {name}</span>
          )
            : (
              <React.Fragment>
                <span style={{ display: 'flex' }}>
                  Name: <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={'your name'} />
                  <button type="button" onClick={saveName}>OK</button>
                </span>
                <span style={{ display: 'flex', color: 'red' }}>{name ? '' : 'please set your name'}</span>
              </React.Fragment>
            )
        }
      </div>
    </div>
    <div style={{ ...rowStyle, marginBottom: '10px' }} >
      Status: {loadingSeats ? 'Loading...'
        : loadingSeatsError
          ? (<span style={{ color: 'red' }}>loadingSeatsError</span>) : 'Loaded'}
    </div>
    <div style={{ ...rowStyle, marginBottom: '40px' }} >
      <div style={{ ...colorExplainStyle, backgroundColor: OwnedColor }}>Owned</div>
      <div style={{ ...colorExplainStyle, backgroundColor: FreeColor }}>Free</div>
      <div style={{ ...colorExplainStyle, backgroundColor: NotOwnedColor }}>Not Owned</div>
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
                    backgroundColor: !s.owner ? FreeColor : (s.owner === name) ? OwnedColor : NotOwnedColor
                  }
                }
                key={s.seat}
                onClick={() => onSeatClick(s)}
              >
                <div style={{ display: 'flex' }}>{clicksMap.get(s.seat) || 0}</div>
                <div style={{ display: 'flex', fontSize: '10px' }}>{getOwnerClicks(s)}</div>
              </div>);
          })}
        </div>)
      })
    }
  </div >);
}
