from locust import HttpUser, task
import random

num_owners = 10
owners = [ f"locust-{i}" for i in range(num_owners) ]
num_blocks = 500
under = 5
over = 1

def get_new_counter(counter): 
    if not counter: 
        return 1

    new_counter = counter + random.randint(-under, over)
    if new_counter < 1:
        return 1

    return new_counter

class BookingUser(HttpUser):
    @task
    def booking(self):
        with self.client.get("/api/booking", name="/api/booking") as res:
            res_json = res.json()

            #sorted_tuples = sorted(res_json, key=lambda b: b["counter"] if b["counter"] else 0)
            selected_blocks = random.sample(res_json, num_blocks)
            owner = random.choice(owners)

            make_booking_req = [{"seat": b["seat"], "owner": owner, "counter": get_new_counter(b["counter"]) } for b in selected_blocks]

            self.client.post("/api/makeBookings", json=make_booking_req, name="/api/makeBookings")