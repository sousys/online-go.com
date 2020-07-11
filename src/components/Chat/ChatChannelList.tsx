/*
 * Copyright (C) 2012-2020  Online-Go.com
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as React from "react";
import * as data from "data";
import { _, pgettext } from "translate";
import { useEffect, useState, useCallback, useRef } from "react";
import { Flag } from "Flag";
import { get } from "requests";
import { browserHistory } from "ogsHistory";
import { errorLogger, shouldOpenNewTab, slugify } from 'misc';
import { chat_manager, ChatChannelProxy, global_channels, group_channels, tournament_channels } from 'chat_manager';

data.setDefault("chat.joined", {});


interface ChatChannelListProperties {
    channel: string;
}

interface ResolvedChannel {
    group_id?: number;
    name: string;
    icon?: string;
    banner?: string;
}

let channel_resolution_cache:{[channel: string]: ResolvedChannel} = {};
let active_resolvers:{[channel: string]: Promise<ResolvedChannel>} = {};

export function ChatChannelList({channel}:ChatChannelListProperties):JSX.Element {
    const joined_channels = data.get("chat.joined");
    const using_resolved_channel:boolean = !(
        group_channels.filter(chan => `group-${chan.id}` === channel).length
        + tournament_channels.filter(chan => `tournament-${chan.id}` === channel).length
        + global_channels.filter(chan => chan.id === channel).length
    );

    let [more, set_more]:[boolean, (tf:boolean) => void] = useState(false as boolean);
    let [search, set_search]:[string, (text:string) => void] = useState("");
    let [resolved_channel, set_resolved_channel]: [ResolvedChannel | null, (s:ResolvedChannel | null) => void] = useState(null);

    //pgettext("Joining chat channel", "Joining"));

    useEffect(() => {
        set_more(false);
        set_search("");
        set_resolved_channel(channel in channel_resolution_cache ? channel_resolution_cache[channel] : null);

        let still_resolving = true;
        if (using_resolved_channel && !(channel in channel_resolution_cache)) {
            if (channel in active_resolvers) {
                active_resolvers[channel].then((res) => {
                    if (still_resolving) {
                        set_resolved_channel(res);
                    }
                })
                .catch(errorLogger);
            } else {
                let resolver:Promise<any>;

                let m = channel.match(/group-([0-9]+)/);
                if (m) {
                    resolver = get(`/termination-api/group/${m[1]}`)
                        .then((res:any):ResolvedChannel => {
                            console.log(res);
                            channel_resolution_cache[channel] = res;
                            delete active_resolvers[channel];
                            if (still_resolving) {
                                set_resolved_channel(res);
                            }
                            return res;
                        })
                        .catch(errorLogger);
                }

                if (!resolver) {
                    resolver = Promise.resolve({
                        name: "<Error>"
                    } as ResolvedChannel);
                }

                active_resolvers[channel] = resolver;
            }
        }

        return () => {
            still_resolving = false;
        };
    }, [channel]);


    let more_channels:JSX.Element;

    function chanSearch(chan: {name: string}):boolean {
        let s = search.toLowerCase().trim();

        if (s === "") {
            return true;
        }

        return chan.name.toLowerCase().indexOf(s) >= 0;
    }

    if (more) {
        more_channels = (
            <div className='joinable'>
                <input type="search"
                    autoFocus={true}
                    value={search}
                    onChange={(ev) => set_search(ev.target.value)}
                    placeholder={_("Search")}
                />

                {group_channels.filter(chan => !(`group-${chan.id}` in joined_channels) && chanSearch(chan)).map((chan) => (
                    <ChatChannel
                        key={`group-${chan.id}`}
                        channel={`group-${chan.id}`}
                        icon={chan.icon}
                        name={chan.name}
                    />
                ))}

                {tournament_channels.filter(chan => !(`tournament-${chan.id}` in joined_channels) && chanSearch(chan)).map((chan) => (
                    <ChatChannel
                        key={`tournament-${chan.id}`}
                        channel={`tournament-${chan.id}`}
                        name={chan.name}
                    />
                ))}

                {global_channels.filter(chan => !(chan.id in joined_channels) && chanSearch(chan)).map((chan) => (
                    <ChatChannel
                        key={chan.id}
                        channel={chan.id}
                        name={chan.name}
                        language={chan.language}
                        country={chan.country}
                    />
                ))}
            </div>
        );
    } else {
        more_channels = (
            <button className='default' onClick={() => set_more(true)}>
                &#9679; &#9679; &#9679;
            </button>
        );
    }


    return (
        <div className='ChatChannelList'>
            {using_resolved_channel
                ? <ChatChannel
                      key={channel}
                      channel={channel}
                      name={resolved_channel?.name || pgettext("Joining chat channel", "Joining...")}
                      icon={resolved_channel?.icon}
                      active={true}
                      joined={true}
                  />
                : null
            }

            {group_channels.filter(chan => `group-${chan.id}` in joined_channels).map((chan) => (
                <ChatChannel
                    key={`group-${chan.id}`}
                    channel={`group-${chan.id}`}
                    active={channel === `group-${chan.id}`}
                    icon={chan.icon}
                    name={chan.name}
                    joined={true}
                />
            ))}

            {tournament_channels.filter(chan => `tournament-${chan.id}` in joined_channels).map((chan) => (
                <ChatChannel
                    key={`tournament-${chan.id}`}
                    channel={`tournament-${chan.id}`}
                    active={channel === `tournament-${chan.id}`}
                    name={chan.name}
                    joined={true}
                />
            ))}

            {global_channels.filter(chan => chan.id in joined_channels).map((chan) => (
                <ChatChannel
                    key={chan.id}
                    channel={chan.id}
                    active={channel === chan.id}
                    name={chan.name}
                    language={chan.language}
                    country={chan.country}
                    joined={true}
                />
            ))}

            {more_channels}
        </div>
    );
}



interface ChatChannelProperties {
    channel: string;
    name: string;
    active?: boolean;
    country?: string;
    language?: string;
    icon?: string;
    joined?: boolean;
}

export function ChatChannel(
    {channel, name, active, country, language, icon, joined}:ChatChannelProperties
):JSX.Element {
    const user = data.get('user');
    const user_country = user?.country || 'un';

    let [proxy, setProxy]:[ChatChannelProxy | null, (x:ChatChannelProxy) => void] = useState(null);
    let [unread_ct, set_unread_ct]:[number, (x:number) => void] = useState(0);

    let setChannel = useCallback(() => {
        if (!joined) {
            const joined_channels = data.get("chat.joined");
            joined_channels[channel] = 1;
            data.set("chat.joined", joined_channels);
        }

        if (name) {
            browserHistory.push(`/chat/${channel}/${slugify(name)}`);
        } else {
            browserHistory.push(`/chat/${channel}`);
        }
    }, [channel, name]);

    useEffect(() => {
        let proxy;

        if (joined) {
            proxy = chat_manager.join(channel);
            setProxy(proxy);
            proxy.on("chat", sync);
            proxy.on("chat-removed", sync);
            //chan.on("join", onChatJoin);
            //chan.on("part", onChatPart);
            sync();

            return () => {
                proxy.part();
            };
        }

        function sync() {
            if (proxy) {
                setTimeout(() => {
                    set_unread_ct(proxy.channel.unread_ct);
                }, 1);
            }
        }
    }, [channel, joined]);

    useEffect(() => {
        if (proxy && active) {
            proxy.channel.markAsRead();
            set_unread_ct(proxy.channel.unread_ct);
        }
    }, [active, proxy]);


    let icon_element:JSX.Element;

    if (channel.indexOf('tournament') === 0) {
        icon_element = <i className="fa fa-trophy" />;
    } else if (channel.indexOf('global') === 0 || channel === 'shadowban') {
        icon_element = <Flag country={country} language={language} user_country={user_country} />;
    } else if (channel.indexOf('group') === 0) {
        icon_element = <img src={icon}/>;
    }

    let mentioned = proxy?.channel.mentioned;
    let unread:JSX.Element;

    if (unread_ct) {
        unread = <span className="unread-count" data-count={`(${unread_ct})`} />;
    }


    let cls = "channel";
    if (active) {
        cls += " active";
    }
    if (mentioned) {
        cls += " mentioned";
    }
    if (unread_ct > 0) {
        cls += " unread";
    }
    if (joined) {
        cls += " joined";
    } else {
        cls += " unjoined";
    }

    return (
        <div className={cls} onClick={setChannel} >
            <span className="channel-name">
                {icon_element}
                <span className='name'>{name}</span>
                {unread}
            </span>
        </div>
    );
}

